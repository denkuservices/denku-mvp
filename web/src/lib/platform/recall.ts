import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanLeadName } from "@/lib/leads/name";

/**
 * Contact recall — what the business already knows about the person it is talking to (R-139).
 *
 * Spec: `docs/CONTACT_RECALL_SPEC.md`. Two sentences carry the whole design:
 *
 * 1. **This module reads. It never writes.** Everything here is a query over records the business
 *    already holds — a contact, their next appointment, whether a request is open. Nothing is
 *    derived, nothing is stored. The moment something inferred gets persisted ("prefers
 *    mornings"), this has become Memory and `docs/MEMORY_CONTRACT.md` (R-110) applies in full,
 *    with a separate store, retention and erasure. That is a different project.
 *
 * 2. **A phone number is not a person.** It is shared with a spouse, answered by a colleague,
 *    handed to a child and reassigned by carriers to strangers. So `resolveRecall` will hand back
 *    facts for a phone number, but the *caller-facing* entry point is `recallForStatedName`, which
 *    returns nothing at all unless the person said a name that matches. The verification is in the
 *    function you are allowed to call, not in a comment asking the model to behave.
 *
 * Tier 1 only (spec §5): their own name, their own next appointment, and the *existence* of an
 * open request. No amounts, no contents, nothing about a third party. If a future caller of this
 * module wants more, that is a product decision with its own authentication, not a bigger select.
 */

export interface RecallFacts {
  contactId: string;
  /** The name to greet them with — already cleaned by the same rules the CRM uses. */
  name: string | null;
  /** Their own next appointment, if it is still in the future. */
  nextAppointmentAt: string | null;
  /** That a request is open. Deliberately not *what* it says (Tier 2). */
  hasOpenRequest: boolean;
}

/** Where the identity came from. Phone is weak and needs a name; a contact id is already resolved. */
export interface RecallLookup {
  orgId: string;
  /** Chat channels: identity is strong and already resolved. */
  contactId?: string | null;
  /** Voice: the caller ID. Weak — see `recallForStatedName`. */
  phone?: string | null;
  db?: SupabaseClient;
}

/**
 * Do two names refer to the same person, as far as a spoken match can tell?
 *
 * Deliberately generous on shape and strict on identity: case and spacing are noise, and a caller
 * who says "Jack" against a stored "Jack Miller" is the same person. A caller who says "Mehmet"
 * is not, and no amount of fuzziness should make it so — this comparison is the only thing
 * standing between a returning customer and a stranger holding their phone.
 *
 * Pure, so the rule can be tested without a database.
 */
export function namesMatch(stated: string | null | undefined, stored: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) =>
    (v ?? "")
      .toLocaleLowerCase("tr")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const a = norm(stated);
  const b = norm(stored);
  if (a.length === 0 || b.length === 0) return false;

  // Exact, in any order ("Jack Miller" vs "Miller Jack").
  if (a.length === b.length && a.every((part) => b.includes(part))) return true;

  // A first name against a full name, in either direction. Requires the FIRST token to match, so
  // "Miller" alone does not unlock "Jack Miller" — a surname is far more often shared or guessable.
  return a[0] === b[0];
}

/** Facts for an already-resolved contact. Read-only, org-scoped, never throws. */
export async function resolveRecall(lookup: RecallLookup): Promise<RecallFacts | null> {
  const db = lookup.db ?? supabaseAdmin;
  const { orgId } = lookup;
  if (!orgId) return null;

  try {
    let contactId = lookup.contactId ?? null;
    let name: string | null = null;

    if (contactId) {
      const { data } = await db
        .from("contacts")
        .select("id, display_name")
        .eq("id", contactId)
        .eq("org_id", orgId)
        .maybeSingle<{ id: string; display_name: string | null }>();
      if (!data) return null;
      name = data.display_name;
    } else if (lookup.phone) {
      /**
       * Voice identities still live on `leads`, not `contacts` — the backfill is R-081 and has
       * not run. `limit(1)` rather than `maybeSingle()` on purpose: the tool routes use
       * `maybeSingle`, so a second lead on one phone number would make them error, and recall
       * must never be the thing that turns a booking into a 500 while we wait for that to be
       * fixed. Oldest wins, which is stable across calls.
       */
      const { data } = await db
        .from("leads")
        .select("id, name")
        .eq("org_id", orgId)
        .eq("phone", lookup.phone)
        .order("created_at", { ascending: true })
        .limit(1);
      const lead = (data ?? [])[0] as { id: string; name: string | null } | undefined;
      if (!lead) return null;
      contactId = lead.id;
      name = lead.name;
    } else {
      return null;
    }

    const nowIso = new Date().toISOString();
    const idColumn = lookup.contactId ? "contact_id" : "lead_id";

    const [appointments, tickets] = await Promise.all([
      db
        .from("appointments")
        .select("start_at")
        .eq("org_id", orgId)
        .eq(idColumn, contactId)
        .gte("start_at", nowIso)
        .in("status", ["scheduled", "requested"])
        .order("start_at", { ascending: true })
        .limit(1),
      db
        .from("tickets")
        .select("id")
        .eq("org_id", orgId)
        .eq(idColumn, contactId)
        .eq("status", "open")
        .limit(1),
    ]);

    return {
      contactId,
      name: cleanLeadName(name),
      // A past appointment is not "your upcoming appointment", and offering one as if it were is
      // how an AI tells a customer to arrive on a day that has already gone.
      nextAppointmentAt: ((appointments.data ?? [])[0] as { start_at: string } | undefined)?.start_at ?? null,
      hasOpenRequest: (tickets.data ?? []).length > 0,
    };
  } catch (err) {
    console.error("[RECALL][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * The caller-facing entry point for a WEAK identity (voice, and later WhatsApp/SMS).
 *
 * Returns facts **only** when the name the caller volunteered matches what we hold. On any
 * mismatch — and on "we hold no name to compare against" — it returns null, so the caller of this
 * function has nothing to leak. That is the security property: the model is never sent data it
 * has not earned, rather than being asked not to use it.
 */
export async function recallForStatedName(
  lookup: RecallLookup & { statedName: string | null }
): Promise<RecallFacts | null> {
  const stated = cleanLeadName(lookup.statedName);
  if (!stated) return null;

  const facts = await resolveRecall(lookup);
  if (!facts) return null;

  // No stored name means nothing to verify against. Silence is correct: an unverifiable claim
  // must not unlock a stranger's appointment just because we happen to know one.
  if (!facts.name) return null;

  return namesMatch(stated, facts.name) ? facts : null;
}

/**
 * The recall block for a chat system prompt. Pure.
 *
 * Short and factual by design — this text is a disclosure to a third-party model (R-110 §3.7
 * carries over even though nothing is stored), so it says the minimum that makes the AI useful
 * and not one field more.
 */
export function recallPromptBlock(facts: RecallFacts | null, timeZone: string | null): string {
  if (!facts) return "";

  const lines: string[] = [];
  if (facts.name) lines.push(`- Name: ${facts.name}`);
  if (facts.nextAppointmentAt) {
    let when = facts.nextAppointmentAt;
    try {
      when = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: timeZone ?? "UTC",
      }).format(new Date(facts.nextAppointmentAt));
    } catch {
      /* fall back to the raw value rather than dropping the fact */
    }
    lines.push(`- Upcoming appointment: ${when}`);
  }
  if (facts.hasOpenRequest) {
    lines.push("- Has an open request with your team (do not guess its status or contents).");
  }

  if (lines.length === 0) return "";

  return (
    "What you already know about this customer — use it naturally, never read it out as a list, " +
    "and never ask for any of it:\n" +
    lines.join("\n")
  );
}

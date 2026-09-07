import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * One row per number. The only way a phone number becomes a lead.
 *
 * ## What went wrong
 *
 * Three call sites (the Vapi webhook, `create-ticket`, `create-appointment`) each carried their
 * own copy of "look it up, and insert if it is missing". Read-modify-write with no constraint
 * underneath is a race, and a live call is the worst place to run one: Vapi posts a dozen
 * `status-update` events for a single conversation, several of which resolve a lead, and they
 * arrive at overlapping times. Two of them find nothing and both insert.
 *
 * That alone would have produced the occasional twin. What produced **266 rows for one caller**
 * was the second half: the lookup used `.maybeSingle()`, which does not return the first match —
 * it returns an *error* when the query matches more than one row. So the moment a number had two
 * leads, every later lookup for that number failed, fell through to the insert branch, and added
 * a third. Then a fourth. The bug's only input was its own output, and each call to a customer's
 * line made their CRM measurably worse: one caller appearing as hundreds of customers, a handful
 * of them wearing a name.
 *
 * ## What makes it right
 *
 * 1. **The database decides.** `leads_org_phone_key` (migration `20260907140000`) is a unique
 *    index on `(org_id, phone)`. Uniqueness is now a fact about the table rather than a hope
 *    about the order three route handlers happen to run in — and a concurrent double-insert
 *    becomes a conflict Postgres resolves, not a duplicate nobody notices.
 * 2. **`.limit(1)`, never a bare `.maybeSingle()`.** This is what stops the runaway from ever
 *    restarting: legacy duplicates, or any future ones, resolve to the first row instead of
 *    poisoning the lookup into creating more.
 * 3. **Never overwrite on conflict.** The insert is `ignoreDuplicates`, so losing the race costs
 *    a re-read and nothing else. An upsert that wrote its own columns would blank the name an
 *    earlier call had learned — and `fillMissingLeadName` deliberately only fills an EMPTY name,
 *    because the owner's correction of a misheard name must survive every later call.
 *
 * Never throws: a lead is a convenience on the artifact path, and the artifact path must never
 * dead-end (CLAUDE.md philosophy #1). A null return means "no lead", not "stop".
 */

export interface ResolveLeadOptions {
  /** Where this lead came from, recorded only when the row is actually created. */
  source?: string;
  /** Set only on creation — an existing lead keeps whatever it already has. */
  email?: string | null;
  /** Set only on creation. Names are filled in afterwards via `fillMissingLeadName`. */
  name?: string | null;
  notes?: string | null;
}

/**
 * Find the lead for this org + phone, creating it once if it does not exist.
 *
 * `phone` must already be normalized by the caller — the unique index matches exact text, so
 * `+905551234567` and `0555 123 45 67` would be two different people to Postgres. Every caller
 * runs it through its own `normalizePhone` first, which is the same rule.
 */
export async function resolveLeadIdByPhone(
  orgId: string,
  phone: string | null,
  options: ResolveLeadOptions = {}
): Promise<string | null> {
  if (!orgId || !phone) return null;

  try {
    // Fast path. `.limit(1)` rather than `.maybeSingle()` alone: this must return the first of N
    // rows, not fail on them — see the note above about how the runaway sustained itself.
    const existing = await findLeadIdByPhone(orgId, phone);
    if (existing) return existing;

    const { data: created, error } = await supabaseAdmin
      .from("leads")
      .upsert(
        {
          org_id: orgId,
          phone,
          name: options.name ?? null,
          email: options.email ?? null,
          notes: options.notes ?? null,
          source: options.source ?? "inbound_call",
          status: "new",
        },
        // DO NOTHING, not DO UPDATE: a concurrent writer that got there first owns the row, and
        // its name/email must not be overwritten with the nulls this caller is holding.
        { onConflict: "org_id,phone", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle<{ id: string }>();

    if (created?.id) return created.id;

    if (error) {
      console.error("[LEADS][RESOLVE][INSERT_FAILED]", { orgId, error: error.message });
    }

    // Either the insert conflicted (someone else won the race) or it failed. Both are answered
    // by reading the row that exists now.
    return await findLeadIdByPhone(orgId, phone);
  } catch (err) {
    console.error("[LEADS][RESOLVE][EXCEPTION]", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** The lookup half, shared by the fast path and the lost-the-race path. */
async function findLeadIdByPhone(orgId: string, phone: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("phone", phone)
    // Oldest first, so that while legacy duplicates still exist every caller agrees on which row
    // is the person — the same row the merge migration keeps.
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[LEADS][RESOLVE][LOOKUP_FAILED]", { orgId, error: error.message });
    return null;
  }
  return data?.id ?? null;
}

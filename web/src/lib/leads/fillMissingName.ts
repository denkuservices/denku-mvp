import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanLeadName } from "./name";

/**
 * Write the caller's name onto a lead that does not have one yet (2026-08-27).
 *
 * A real call exposed this: the caller said "My name is Gaye", the booking tool received a name,
 * and `leads.name` stayed null — so the Inbox said "Unknown contact" for someone who had
 * introduced themselves. The cause is an ordering accident, not a missing feature. The Vapi
 * webhook creates the lead from caller ID the moment the call starts, seconds before any name is
 * spoken; by the time the booking tool runs, the lead EXISTS, so both tool routes took their
 * "found it" branch and never looked at the name they were holding.
 *
 * Two rules make this safe to run on every artifact:
 *
 *   1. **Only fill an empty name.** The update is conditional (`name IS NULL`), which is what
 *      makes an owner's correction permanent: transcription mishears proper nouns — "Gaye" came
 *      back as "Joya" — and the phone number, not the name, is the identity. The owner fixes the
 *      spelling once, and no later call can overwrite it.
 *   2. **Never throw.** This runs inside artifact creation, which must never dead-end.
 */

export async function fillMissingLeadName(
  orgId: string,
  leadId: string | null,
  rawName: string | null | undefined
): Promise<void> {
  if (!orgId || !leadId) return;
  const name = cleanLeadName(rawName);
  if (!name) return;

  try {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("id", leadId)
      .is("name", null)
      .select("id");

    if (error) {
      console.error("[LEADS][NAME][FILL_FAILED]", { orgId, leadId, error: error.message });
      return;
    }
    if (data?.length) {
      console.log("[LEADS][NAME][FILLED]", { orgId, leadId });
    }
  } catch (err) {
    console.error("[LEADS][NAME][FILL_EXCEPTION]", {
      orgId,
      leadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

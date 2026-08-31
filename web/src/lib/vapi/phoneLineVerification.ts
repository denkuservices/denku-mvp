import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * Prove a BYO line really belongs to the tenant who claimed it.
 *
 * There is no OTP and no separate challenge, because there does not need to be: a line only
 * receives an inbound call if the customer's carrier is actually forwarding that number to Vapi,
 * and only the party who controls the number can make the carrier do that. **The first real call
 * IS the proof of control.** Anything else we could build (an emailed code, a claim form) proves
 * less and costs more.
 *
 * Consequences worth keeping in mind when editing:
 * - A `pending` line must still ANSWER. If we refused calls until verified, verification could
 *   never happen. Pending means "not yet proven", not "not yet live".
 * - The write is a conditional UPDATE, so the webhook can deliver the same event any number of
 *   times without moving `verified_at`. Idempotency is the house rule for every webhook write.
 * - It never throws. This runs inside the Vapi webhook, where an exception would cost the call
 *   its artifact — the never-dead-end guarantee outranks bookkeeping.
 */
export async function markPhoneLineVerified(
  orgId: string,
  vapiPhoneNumberId: string
): Promise<void> {
  if (!orgId || !vapiPhoneNumberId) return;

  try {
    const { data, error } = await supabaseAdmin
      .from("phone_lines")
      .update({ verification_status: "verified", verified_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("vapi_phone_number_id", vapiPhoneNumberId)
      .eq("verification_status", "pending")
      .select("id");

    if (error) {
      // A missing column means the BYO migration has not been applied yet. That is not an
      // incident: every pre-BYO line is already 'verified' by definition, so there is nothing
      // to mark. Log at info and move on rather than paging someone.
      const missingColumn = /column .* does not exist/i.test(error.message ?? "");
      logEvent({
        tag: missingColumn
          ? "[PHONE_LINES][VERIFY][SKIPPED]"
          : "[PHONE_LINES][VERIFY][FAILED]",
        ts: Date.now(),
        stage: "CALL",
        source: "vapi_webhook",
        org_id: orgId,
        severity: missingColumn ? "info" : "error",
        details: { phone_number_id: vapiPhoneNumberId, error: error.message },
      });
      return;
    }

    // Zero rows is the normal case: the line was already verified, or was never BYO.
    if (data && data.length > 0) {
      logEvent({
        tag: "[PHONE_LINES][VERIFY][OK]",
        ts: Date.now(),
        stage: "CALL",
        source: "vapi_webhook",
        org_id: orgId,
        severity: "info",
        details: {
          phone_number_id: vapiPhoneNumberId,
          line_id: (data[0] as { id?: string })?.id,
          proof: "first inbound call arrived on the claimed number",
        },
      });
    }
  } catch {
    // Never throw from the webhook path.
  }
}

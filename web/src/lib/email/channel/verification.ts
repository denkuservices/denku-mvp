import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Forwarding verification state.
 *
 * Two things can prove a customer's forwarding rule is real, and either is enough:
 *   1. Gmail's confirmation mail arrives at the address we issued, and we complete the
 *      handshake for them (`recordForwardConfirmation`).
 *   2. An actual customer email arrives (`markInbound` in connections.ts stamps the same
 *      column). Outlook and cPanel have no handshake at all, so for those customers this is
 *      the only proof there will ever be.
 *
 * The code is stored even when the automatic confirmation succeeds, because the UI shows it as
 * a fallback: if Google changes the link shape, the owner can still paste the number by hand
 * rather than being stuck behind our parser.
 */
export async function recordForwardConfirmation(
  connectionId: string,
  code: string | null,
  autoConfirmed: boolean,
  verificationUrl?: string | null
): Promise<void> {
  try {
    const values: Record<string, unknown> = { forward_verification_code: code };

    /**
     * The link is stored, not just the code, and that is the difference between a fallback that
     * works and one that does not.
     *
     * Gmail's mail in Turkish carried NO numeric code at all — only the link. Keeping the code
     * alone left a customer whose auto-confirmation failed with nothing to act on, made worse by
     * the fact that we correctly hide this mail from their Inbox: hiding it removed the one place
     * they could have clicked it themselves.
     */
    if (verificationUrl) {
      values.meta = { gmail_verification_url: verificationUrl };
    }
    // Only an actually-completed handshake counts as verified. A code we merely read proves
    // Gmail is talking to us, not that forwarding is switched on.
    if (autoConfirmed) values.forward_verified_at = new Date().toISOString();

    await supabaseAdmin.from("email_connections").update(values).eq("id", connectionId);
  } catch (err) {
    console.error("[EMAIL][FORWARD_CONFIRM][ERROR]", err instanceof Error ? err.message : String(err));
  }
}

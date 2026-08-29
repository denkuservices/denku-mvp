import type { InboundEmail } from "@/lib/platform/adapters/email";

/**
 * Gmail's forwarding handshake, completed for the customer.
 *
 * Before Gmail will forward anything it emails a confirmation code to the destination and
 * refuses to proceed until someone proves they control it. That mail lands at the address WE
 * issued — so we can read the code and finish the handshake ourselves instead of asking a shop
 * owner to copy a nine-digit number between two browser tabs. It is the single biggest
 * reduction in setup friction available on this channel, and it costs one parser.
 *
 * (Outlook and most cPanel hosts have no such step; this is Gmail-only, and its absence is not
 * an error.)
 *
 * This confirmation is NEVER a Conversation. It is machine correspondence about plumbing, and
 * showing it to a business owner as "a customer wrote in" would be a bug.
 */

export interface GmailForwardingConfirmation {
  /** The numeric code Gmail also prints in its settings UI. */
  code: string | null;
  /** The one-click verification link. Following it completes the handshake. */
  verificationUrl: string | null;
  /** The mailbox that asked to forward here, when Gmail names it. */
  requestedBy: string | null;
}

/** Senders Gmail uses for the forwarding handshake. */
const GMAIL_FORWARDING_SENDERS = ["forwarding-noreply@google.com", "noreply@google.com"];

function bodyOf(email: InboundEmail): string {
  const parts = [email.subject ?? "", email.text ?? "", email.html ?? ""];
  return parts.join("\n");
}

/**
 * Recognise Gmail's forwarding confirmation and pull out what completes it.
 *
 * Returns null for anything else — including a customer who merely mentions Gmail — because a
 * false positive here silently swallows a real message.
 */
export function parseGmailConfirmation(email: InboundEmail): GmailForwardingConfirmation | null {
  const from = (email.from ?? "").toLowerCase();
  if (!GMAIL_FORWARDING_SENDERS.some((sender) => from.includes(sender))) return null;

  const subject = email.subject ?? "";
  const body = bodyOf(email);

  /**
   * Detection keys on the LINK, not on the wording.
   *
   * The first version matched English subjects ("Gmail Forwarding Confirmation") and the
   * `(#123456789)` prefix. Gmail sends this mail in the **recipient's own language**: the real
   * one arrived as "Gmail Yönlendirme Onayı — … Adresinden Posta Alma", matched nothing, and was
   * shown to the business owner as though a customer had written in. Denku answers in whatever
   * language the customer writes, so a parser that only reads English was always going to break
   * on the first non-English workspace.
   *
   * The verification URL is the same shape in every language, which makes it the honest key.
   */
  const verificationUrl = extractVerificationUrl(body);

  // The English form still carries a numeric code, and a mail that has one is a confirmation even
  // if the link shape ever changes. Either signal is enough; neither alone is required.
  const codeFromSubject = subject.match(/\(#(\d{6,})\)/);
  const codeFromBody = body.match(/confirmation code[^0-9]{0,40}(\d{6,})/i);
  const code = codeFromSubject?.[1] ?? codeFromBody?.[1] ?? null;

  if (!verificationUrl && !code) return null;

  const requestedBy =
    body.match(/Receive Mail from\s+([^\s<>"']+@[^\s<>"']+)/i)?.[1] ??
    // Language-independent fallback: the requesting mailbox is the first address in the body that
    // is not the address we issued.
    body.match(/([A-Za-z0-9._%+-]+@(?!in\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,})/)?.[1] ??
    null;

  return {
    code,
    verificationUrl,
    requestedBy: requestedBy ? requestedBy.toLowerCase() : null,
  };
}

/**
 * The "yes, forward here" link — and never the "no, cancel" one.
 *
 * Gmail puts BOTH in the same mail: `/mail/vf-…` confirms the request, `/mail/uf-…` withdraws it.
 * They sit paragraphs apart under localised prose, so taking the first Google link found would
 * eventually follow `uf-` and cancel the very forwarding the customer just set up — silently, and
 * looking exactly like Gmail never sent the mail. The prefix is matched explicitly for that
 * reason.
 *
 * The host is `mail-settings.google.com` in current mail and was `mail.google.com` historically;
 * both are accepted.
 */
function extractVerificationUrl(body: string): string | null {
  const match = body.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/vf-[^\s"'<>)]+/i);
  return match ? match[0].replace(/&amp;/g, "&") : null;
}

/**
 * Follow Gmail's verification link so the customer does not have to.
 *
 * Best-effort and deliberately forgiving: if Google changes the link shape or the request
 * fails, the customer can still paste the code by hand — the UI shows it for exactly that
 * reason. Never throws.
 */
export async function completeGmailForwarding(confirmation: GmailForwardingConfirmation): Promise<boolean> {
  if (!confirmation.verificationUrl) return false;
  try {
    const res = await fetch(confirmation.verificationUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn("[EMAIL][GMAIL_FORWARDING][CONFIRM][NOT_OK]", { status: res.status });
      return false;
    }
    console.info("[EMAIL][GMAIL_FORWARDING][CONFIRM][OK]");
    return true;
  } catch (err) {
    console.warn("[EMAIL][GMAIL_FORWARDING][CONFIRM][FAILED]", err instanceof Error ? err.message : String(err));
    return false;
  }
}

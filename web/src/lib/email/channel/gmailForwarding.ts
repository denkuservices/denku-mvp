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
  // Both the English subject and the (#123456789) form Gmail puts in front of it.
  const looksLikeConfirmation =
    /forwarding confirmation/i.test(subject) || /gmail.*(confirm|doğrula)/i.test(subject) || /^\(#\d{6,}\)/.test(subject.trim());
  if (!looksLikeConfirmation) return null;

  const body = bodyOf(email);

  // Gmail prints the code in the subject as (#123456789) and again in the body.
  const codeFromSubject = subject.match(/\(#(\d{6,})\)/);
  const codeFromBody = body.match(/confirmation code[^0-9]{0,40}(\d{6,})/i) ?? body.match(/\b(\d{9})\b/);
  const code = codeFromSubject?.[1] ?? codeFromBody?.[1] ?? null;

  const urlMatch = body.match(/https:\/\/mail\.google\.com\/[^\s"'<>)]+/);

  const requestedBy = body.match(/Receive Mail from\s+([^\s<>"']+@[^\s<>"']+)/i)?.[1] ?? null;

  return {
    code,
    verificationUrl: urlMatch ? urlMatch[0].replace(/&amp;/g, "&") : null,
    requestedBy: requestedBy ? requestedBy.toLowerCase() : null,
  };
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

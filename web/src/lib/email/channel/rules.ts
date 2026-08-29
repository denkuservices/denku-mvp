import { baseSubject } from "@/lib/platform/adapters/email";

/**
 * The pure decisions that stand between "the AI wrote something" and "a stranger received mail
 * claiming to be from a business".
 *
 * Deliberately in their own module with NO server imports. `domains.ts` and `sending.ts` both
 * reach the database and are `server-only`, which would drag a Supabase client into any test
 * that wanted to check a suffix rule. These are the parts worth testing hardest — one of them is
 * a security boundary — so they live where a test can reach them, the same way the channel
 * adapter stayed pure.
 */

/** Sending identity for one org, once its domain is verified. */
export interface SendIdentity {
  fromName: string | null;
  fromAddress: string;
  replyTo: string | null;
}

/** Strip a scheme, path, or leading `@`/`www.` from whatever the customer typed. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^https?:\/\//, "").replace(/^@/, "").split("/")[0].split("?")[0];
  // An address pasted where a domain was asked for is a predictable mistake, and the domain is
  // recoverable from it, so recover it rather than rejecting.
  if (value.includes("@")) value = value.split("@").pop() ?? "";
  value = value.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  return value;
}

/**
 * Is this address inside the org's verified sending domain?
 *
 * A security boundary, not a formatting check. The `endsWith` guard is written against a real
 * attack shape: `notyourshop.com` ends with `yourshop.com` as a string, and a naive suffix test
 * would hand anyone who registers a suffix domain the right to send under a signature that was
 * never theirs. Only the domain itself or a true subdomain of it passes.
 */
export function addressBelongsToDomain(
  address: string | null | undefined,
  domain: string | null | undefined
): boolean {
  if (!address || !domain) return false;
  const host = address.trim().toLowerCase().split("@")[1];
  if (!host) return false;
  const base = domain.trim().toLowerCase();
  return host === base || host.endsWith(`.${base}`);
}

/** RFC 5322 `From:` — a display name is quoted so a comma in a business name cannot split it. */
export function formatFrom(identity: SendIdentity): string {
  const name = identity.fromName?.trim();
  if (!name) return identity.fromAddress;
  return `"${name.replace(/"/g, "'")}" <${identity.fromAddress}>`;
}

/** `Re:` exactly once, however many times the thread has already gone round. */
export function replySubject(subject: string | null | undefined): string {
  const base = baseSubject(subject);
  if (!base) return "Re: your message";
  return `Re: ${base}`;
}

/** Wrap a Message-ID in angle brackets, as the headers require. */
export function angle(id: string): string {
  return id.startsWith("<") ? id : `<${id}>`;
}

import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";

/**
 * Email channel adapter.
 *
 * Maps one received email into a normalized inbound message. Pure, deterministic, never
 * throws — anything it does not understand returns `[]` and the webhook still answers 200.
 *
 * Email is the first channel whose native shape does NOT match the platform's. Telegram hands
 * us a sentence; email hands us a MIME document with a subject, an HTML body, a signature, and
 * the entire prior conversation quoted underneath. Four decisions carry that gap:
 *
 * - **The thread key is the References root, not the subject.** Two different customers both
 *   writing "Re: Hello" are not one conversation, and the same customer changing the subject
 *   mid-thread has not started a new one. The root Message-ID of the References chain is the
 *   only key that is stable in both directions.
 * - **The body is flattened at ingest, not at render.** `DefaultTurnRenderer` deliberately
 *   prints plain text only, so that no untrusted string can bring markup with it. Rather than
 *   argue with that policy, HTML is converted and the quoted history is cut off HERE, once,
 *   where it is testable — leaving the Inbox showing what the person actually just wrote.
 * - **The sender comes from the `From:` header.** Gmail rewrites the envelope `Return-Path` to
 *   its own domain when forwarding but leaves `From:` intact, so the real customer address
 *   survives the hop. The envelope sender would give us the forwarder every time.
 * - **Automated mail is refused, not stored.** This is the one channel where answering the
 *   wrong thing starts a loop: two auto-responders can volley forever, and a newsletter is not
 *   a customer. See `isAutomatedEmail`.
 *
 * The provider's payload is normalized into `InboundEmail` by the webhook, so this file knows
 * nothing about Resend. Swapping to Postmark changes the route, not the adapter.
 */

/** One received email, provider-agnostic. Assembled by the channel webhook. */
export interface InboundEmail {
  /** RFC 5322 Message-ID, angle brackets optional. */
  messageId?: string | null;
  inReplyTo?: string | null;
  /** Either the raw header string or an already-split list. */
  references?: string[] | string | null;
  /** Raw `From:` value — "Ayşe Yılmaz <ayse@example.com>" or a bare address. */
  from?: string | null;
  to?: string[] | string | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  /** Lower-cased header map, for the checks that decide whether this is a person. */
  headers?: Record<string, string | string[] | null | undefined> | null;
  receivedAt?: string | null;
  attachments?: Array<{ filename?: string | null; contentType?: string | null; size?: number | null }> | null;
}

/**
 * What the webhook hands the adapter: the mail, plus the addresses that are US.
 *
 * `selfAddresses` exists for the loop guard and cannot be derived from the mail itself — it is
 * the connection's own inbound/sending addresses and the org's notification address.
 */
export interface EmailInboundPayload {
  email: InboundEmail;
  selfAddresses?: string[] | null;
}

/** Normalize an address for identity: unwrap "Name <addr>", lower-case, trim. */
export function normalizeEmailAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const angled = raw.match(/<([^>]+)>/);
  const candidate = (angled ? angled[1] : raw).trim().replace(/^mailto:/i, "");
  // One `@`, something either side, no whitespace. Deliberately permissive about TLDs.
  if (!/^[^\s@]+@[^\s@]+$/.test(candidate)) return null;
  /**
   * Lower-cased and otherwise left alone. Gmail's dot-and-plus canonicalisation is NOT
   * applied: `a.b@gmail.com` and `ab@gmail.com` are the same Gmail mailbox but are two
   * different mailboxes almost everywhere else, and merging two customers into one contact is
   * a worse error than keeping one customer as two.
   */
  return candidate.toLowerCase();
}

/** The name a human would call them, from a `From:` value. Falls back to the local part. */
export function displayNameFromAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const angled = raw.match(/^\s*(.*?)\s*<[^>]+>\s*$/);
  if (angled) {
    const name = angled[1].replace(/^["']|["']$/g, "").trim();
    if (name) return name;
  }
  const address = normalizeEmailAddress(raw);
  if (!address) return null;
  const local = address.split("@")[0];
  // "ayse.yilmaz" reads better than "ayse.yilmaz@..." in a conversation list, and better than
  // nothing at all when the sender set no display name.
  const spaced = local.replace(/[._-]+/g, " ").trim();
  if (!spaced) return null;
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip angle brackets and whitespace from a Message-ID. */
function cleanMessageId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^</, "").replace(/>$/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Split a `References:` header (whitespace-separated `<id>` tokens) into ids. */
export function parseReferences(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return raw.map(cleanMessageId).filter((id): id is string => Boolean(id));
  }
  if (typeof raw !== "string") return [];
  const matches = raw.match(/<[^>]+>/g);
  const tokens = matches ?? raw.split(/\s+/);
  return tokens.map(cleanMessageId).filter((id): id is string => Boolean(id));
}

/**
 * The conversation key for one email.
 *
 * The FIRST id in `References` is the message that started the thread, and every compliant
 * client carries it forward on every reply — which makes it stable no matter how many times
 * the subject is edited or who else joins. `In-Reply-To` is the fallback for clients that send
 * only that, and a mail with neither is itself the start of a thread.
 */
export function emailThreadKey(email: InboundEmail): string | null {
  const references = parseReferences(email.references);
  if (references.length > 0) return references[0];
  const inReplyTo = cleanMessageId(email.inReplyTo);
  if (inReplyTo) return inReplyTo;
  return cleanMessageId(email.messageId);
}

/** Strip `Re:`/`Fwd:` prefixes for a stable, human-readable subject. */
export function baseSubject(subject: string | null | undefined): string | null {
  if (typeof subject !== "string") return null;
  const stripped = subject.replace(/^\s*((re|fwd?|aw|sv|yan|ilt)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return stripped.length > 0 ? stripped : null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#160": " ",
};

/** Convert an HTML mail body to readable plain text. Not a sanitizer — a reducer. */
export function htmlToText(html: string): string {
  return (
    html
      // Quoted history in HTML mail lives in <blockquote>; drop it wholesale before tags go.
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "\n")
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&([a-z0-9#]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
      .replace(/[ \t ]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Markers that begin the quoted history of a previous message.
 *
 * Deliberately anchored and specific. A loose rule here is expensive in both directions: too
 * greedy and we truncate what the customer actually asked; too lax and the AI answers a
 * forty-line quotation of its own last reply.
 */
const QUOTE_MARKERS: RegExp[] = [
  // "On Tue, 12 Aug 2026 at 10:04, Ayşe <a@b.com> wrote:" and its wrapped variants.
  /^\s*On\s.+\s+wrote:\s*$/im,
  /^\s*On\s.+,\s*$/im,
  // Turkish clients: "12 Ağu 2026 Sal, 10:04 tarihinde Ayşe <a@b> şunu yazdı:"
  /^\s*.+\starihinde\s.+\s(şunu\s+yazdı|yazdı):\s*$/im,
  /^\s*-{2,}\s*(Original Message|Forwarded message|İletilen ileti)\s*-{2,}\s*$/im,
  // Outlook's divider, then its header block.
  /^\s*_{10,}\s*$/im,
  /^\s*From:\s.+$/im,
  /^\s*Kimden:\s.+$/im,
  /^\s*Sent from my \w+/im,
];

/**
 * Cut the quoted history and signature off a plain-text body.
 *
 * Keeps only what this person wrote just now — which is what belongs in the Inbox bubble and
 * what the reply engine should be answering.
 */
export function stripQuotedReply(text: string): string {
  let cut = text.length;

  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cut) cut = match.index;
  }

  // A run of `>`-prefixed lines is quoted material in every mail client ever written.
  const quotedBlock = /^\s*>.*$/m.exec(text);
  if (quotedBlock && quotedBlock.index < cut) cut = quotedBlock.index;

  let body = text.slice(0, cut);

  // RFC 3676 signature delimiter: "-- " alone on a line. Everything after it is a signature.
  const signature = /\n-{2}\s*\n/.exec(body);
  if (signature) body = body.slice(0, signature.index);

  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/** Prefer the plain-text part; fall back to reduced HTML. Then cut quotes and signature. */
export function flattenEmailBody(text: string | null | undefined, html: string | null | undefined): string {
  const plain = typeof text === "string" && text.trim() ? text : typeof html === "string" ? htmlToText(html) : "";
  return stripQuotedReply(plain);
}

/** Read one header case-insensitively, collapsing a repeated header to its first value. */
function header(email: InboundEmail, name: string): string | null {
  const headers = email.headers;
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const value = headers[key];
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : null;
  return value == null ? null : String(value);
}

/** Local parts that are never a person waiting for an answer. */
const ROBOT_LOCAL_PARTS = [
  "no-reply",
  "noreply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "notifications",
  "notification",
];

/**
 * Is this machine-generated mail we must not open a conversation for?
 *
 * Email is the only channel Denku answers where replying to the wrong sender can start an
 * unbounded loop: an out-of-office answers our answer, which answers it back. The standard
 * headers below exist precisely so that automated systems can recognise each other, and
 * honouring them is what keeps a shared inbox from melting down at 3am.
 */
export function isAutomatedEmail(email: InboundEmail): boolean {
  // RFC 3834. Anything but "no" means the message was generated by a machine.
  const autoSubmitted = header(email, "auto-submitted");
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") return true;

  // Microsoft's equivalent, still emitted by Exchange out-of-office.
  const autoReply = header(email, "x-auto-response-suppress");
  if (autoReply) return true;

  const precedence = header(email, "precedence");
  if (precedence && /^(bulk|list|junk|auto_reply)$/i.test(precedence.trim())) return true;

  // Any List-* header means a mailing list or a bulk sender, not a correspondent.
  if (email.headers) {
    const hasListHeader = Object.keys(email.headers).some((k) => /^list-(id|unsubscribe|post|help|archive)$/i.test(k));
    if (hasListHeader) return true;
  }

  const from = normalizeEmailAddress(email.from);
  if (!from) return true;
  const local = from.split("@")[0];
  if (ROBOT_LOCAL_PARTS.some((robot) => local === robot || local.startsWith(`${robot}+`))) return true;

  return false;
}

/**
 * Is this mail one of ours coming back to us?
 *
 * A real hazard, not a hypothetical: `notifyNewArtifactsForConversation` emails the owner
 * every time the AI creates a ticket. If the owner's notification address is the mailbox they
 * forwarded to Denku, that notification arrives as "a customer wrote in", the AI answers it,
 * which creates another artifact, which sends another notification. Nothing else in the
 * pipeline would stop it.
 */
export function isSelfAddressed(email: InboundEmail, selfAddresses: string[] | null | undefined): boolean {
  const from = normalizeEmailAddress(email.from);
  if (!from) return true;
  if (!selfAddresses || selfAddresses.length === 0) return false;
  return selfAddresses
    .map((address) => normalizeEmailAddress(address))
    .filter((address): address is string => Boolean(address))
    .includes(from);
}

export const emailAdapter: ChannelAdapter = {
  channel: "email",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const payload = raw as EmailInboundPayload | null;
    if (!payload?.email || !ctx.orgId) return [];

    const email = payload.email;

    if (isAutomatedEmail(email)) return [];
    if (isSelfAddressed(email, payload.selfAddresses)) return [];

    const from = normalizeEmailAddress(email.from);
    if (!from) return [];

    const threadId = emailThreadKey(email);
    if (!threadId) return [];

    const content = flattenEmailBody(email.text, email.html);
    const subject = baseSubject(email.subject);

    /**
     * An empty body is not necessarily an empty message here.
     *
     * Unlike Telegram, where a message with no text is a sticker we cannot act on, a mail whose
     * whole point is in the subject line ("Cancelling tomorrow's 3pm") is a perfectly ordinary
     * thing for a customer to send. Falling back to the subject keeps that person answered.
     */
    const body = content || subject;
    if (!body) return [];

    const attachments = (email.attachments ?? []).map((file) => ({
      filename: file.filename ?? null,
      contentType: file.contentType ?? null,
      size: file.size ?? null,
    }));

    return [
      {
        channel: "email",
        orgId: ctx.orgId,
        agentId: ctx.agentId ?? null,
        externalThreadId: threadId,
        contact: {
          externalId: from,
          displayName: displayNameFromAddress(email.from),
          email: from,
        },
        message: {
          role: "user",
          direction: "inbound",
          content: body,
          // The RFC Message-ID is globally unique by construction, which is exactly what
          // `messages_convo_extid_uidx` needs to make a redelivered webhook a no-op.
          externalMessageId: cleanMessageId(email.messageId),
          createdAt: email.receivedAt ?? undefined,
        },
        transcriptForIntent: subject ? `${subject}\n\n${body}` : body,
        meta: {
          subject,
          email_from: from,
          email_message_id: cleanMessageId(email.messageId),
          email_in_reply_to: cleanMessageId(email.inReplyTo),
          email_references: parseReferences(email.references),
          // Received but not rendered or sent — the same deliberate gap Telegram has with
          // photos. Recording the metadata means the owner is not left wondering why a mail
          // that clearly had an invoice on it looks bare.
          email_attachments: attachments,
          email_had_attachments: attachments.length > 0,
        },
      },
    ];
  },
};

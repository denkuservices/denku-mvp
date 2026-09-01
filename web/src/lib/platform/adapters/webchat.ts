import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";
import type { InboundAttachment } from "@/lib/platform/media/types";

/**
 * Web Chat channel adapter.
 *
 * Maps one widget message into a normalized inbound record. Pure, deterministic, never throws —
 * anything it does not understand returns `[]` and the endpoint still answers cleanly.
 *
 * Three decisions worth knowing, and all three come from this channel having no provider:
 *
 * - **The thread key is the session id, not the visitor id.** They are one-to-one today, but
 *   the session is the row that can be closed and reopened; keying on it means "start a new
 *   chat" stays a thing we can implement without every past message following the visitor into
 *   the new thread.
 * - **The contact key is the visitor id** — a random string the widget keeps in the browser. It
 *   is honestly weak identity: it dies with the browser profile and says nothing about who the
 *   person is. That is exactly why `contact.displayName` is left null rather than filled with
 *   "Website visitor": the Inbox already renders an unnamed contact properly, and inventing a
 *   name would put a fake one into `contacts` where recall (R-139) would later read it as fact.
 * - **The message id comes from the client**, scoped by session. The widget generates one id
 *   per send and retries with the same one, so a flaky mobile connection produces one message
 *   in the owner's Inbox instead of three. It is scoped by session because a client-chosen id
 *   is not trustworthy on its own — prefixing it makes a collision across visitors impossible.
 *
 * `pageUrl` rides along in meta because it is the single most useful thing a shop owner can
 * know about a website question: what the person was looking at when they asked.
 */

export interface WebChatInboundPayload {
  /** `web_chat_sessions.id` — resolved from the signed token, never from the request body. */
  sessionId: string;
  /** Browser-local visitor id, likewise from the token. */
  visitorId: string;
  text: string;
  /** Client-generated id for this send, so a retry is idempotent. */
  clientMessageId?: string | null;
  pageUrl?: string | null;
  locale?: string | null;
  /**
   * Files the visitor uploaded BEFORE sending, already validated and already in our bucket.
   *
   * The route builds these from the storage keys the upload endpoint issued, after checking each
   * one belongs to this session — so by the time the adapter sees them, a reference to someone
   * else's file has already been dropped. This adapter does no checking of its own precisely
   * because it cannot: it is pure, and ownership is a database question.
   */
  attachments?: InboundAttachment[];
}

/** Guards against a client posting a novel into a public endpoint. */
export const MAX_WEB_CHAT_MESSAGE_CHARS = 2000;

export const webChatAdapter: ChannelAdapter = {
  channel: "web",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const payload = raw as WebChatInboundPayload | null;
    if (!payload || !ctx.orgId) return [];

    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : "";
    const visitorId = typeof payload.visitorId === "string" ? payload.visitorId : "";
    if (!sessionId || !visitorId) return [];

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
    // A photo with no caption is a message; an empty send is not.
    if (!text && attachments.length === 0) return [];

    return [
      {
        channel: "web",
        orgId: ctx.orgId,
        agentId: ctx.agentId ?? null,
        externalThreadId: sessionId,
        contact: {
          externalId: visitorId,
          // Deliberately null — see the note above. The AI asks for a name when it needs one.
          displayName: null,
        },
        message: {
          role: "user",
          direction: "inbound",
          content: text.slice(0, MAX_WEB_CHAT_MESSAGE_CHARS),
          attachments,
          externalMessageId: payload.clientMessageId
            ? `${sessionId}:${String(payload.clientMessageId).slice(0, 64)}`
            : null,
        },
        transcriptForIntent: text,
        meta: {
          web_chat_session_id: sessionId,
          web_chat_visitor_id: visitorId,
          web_chat_page_url: payload.pageUrl ?? null,
          web_chat_locale: payload.locale ?? null,
        },
      },
    ];
  },
};

import { NextRequest } from "next/server";
import { getConnectionById } from "@/lib/webchat/connections";
import { markInbound } from "@/lib/webchat/connections";
import { attachConversation, getSessionById, recordInbound, withinInboundBudget } from "@/lib/webchat/sessions";
import { verifySessionToken } from "@/lib/webchat/token";
import { loadThread } from "@/lib/webchat/thread";
import {
  allow,
  connectionUsable,
  corsFor,
  preflight,
  readJson,
  refuse,
  requestOrigin,
} from "@/lib/webchat/http";
import { webChatAdapter, MAX_WEB_CHAT_MESSAGE_CHARS } from "@/lib/platform/adapters/webchat";
import { ingestInboundMessage } from "@/lib/platform/ingest";
import { respondToInbound } from "@/lib/platform/reply/respond";

export const dynamic = "force-dynamic";

/**
 * One message from a website visitor: record it, answer it, hand back the answer.
 *
 * This is the Telegram webhook's twin, and it is worth reading them side by side — same
 * adapter → `ingestInboundMessage` → `respondToInbound` spine, same never-let-the-channel-break
 * discipline. Three things differ, all because there is no provider in the middle:
 *
 *   1. **Identity comes from the signed token, never from the body.** The request may claim a
 *      message; it may not claim an org. `orgId`, `connectionId` and `sessionId` are read out of
 *      the HMAC, and the body's only job is to carry text.
 *   2. **The connection is re-checked on every send.** A token issued two hours ago says nothing
 *      about whether the customer has since switched the widget off or removed the domain.
 *   3. **The reply is returned in the response**, because the visitor is holding the connection
 *      open and waiting. Polling still exists for the case this cannot cover — a person
 *      answering from the Inbox minutes later — but making the common case synchronous is the
 *      difference between a chat that feels alive and one that feels like email.
 *
 * The response is `200 { ok: true }` even when the AI stays silent (a person has taken the
 * conversation over, or the workspace has not bought this channel). The message WAS received and
 * is in the owner's Inbox; telling the visitor otherwise would be false.
 */

interface Body {
  token?: string;
  text?: string;
  /** Client-generated per send; a retry reuses it so the owner sees one message, not three. */
  clientMessageId?: string;
  pageUrl?: string;
  /** ISO timestamp of the newest message the widget already has. */
  after?: string;
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const origin = requestOrigin(req);
  const body = await readJson<Body>(req);

  const claims = verifySessionToken(body?.token);
  if (!claims) return refuse("invalid_session", 401);

  const text = (body?.text ?? "").trim();
  if (!text || text.length > MAX_WEB_CHAT_MESSAGE_CHARS) return refuse("bad_request", 400);

  const connection = await getConnectionById(claims.cid);
  const problem = connectionUsable(connection, origin);
  if (problem || !connection) {
    console.warn("[WEBCHAT][SEND][REFUSED]", { reason: problem });
    return refuse(problem ?? "origin_not_allowed", 403);
  }

  // The token is signed, but the session it names can have been deleted since (the customer
  // removed the install and the rows cascaded). Trust the signature for identity, the database
  // for existence.
  const session = await getSessionById(claims.sid);
  if (!session || session.orgId !== claims.org || session.connectionId !== connection.id) {
    return refuse("invalid_session", 401);
  }

  if (session.conversationId && !(await withinInboundBudget(session.orgId, session.conversationId))) {
    console.warn("[WEBCHAT][SEND][RATE_LIMITED]", {
      org_id: session.orgId,
      conversation_id: session.conversationId,
    });
    return refuse("rate_limited", 429);
  }

  try {
    const [normalized] = webChatAdapter.normalizeInbound(
      {
        sessionId: session.id,
        visitorId: session.visitorId,
        text,
        clientMessageId: body?.clientMessageId ?? null,
        pageUrl: body?.pageUrl ?? null,
      },
      { orgId: session.orgId, agentId: connection.assignedAgentId }
    );
    if (!normalized) return refuse("bad_request", 400);

    const ingested = await ingestInboundMessage({
      ...normalized,
      // `connection_id` is the generic key `resolveOutboundTarget` reads when a person replies
      // from the Inbox — writing it here is what makes human takeover work on this channel with
      // no channel-specific code in the Inbox.
      meta: { ...normalized.meta, connection_id: connection.id },
    });

    if (!ingested.ok || !ingested.conversationId) {
      console.error("[WEBCHAT][SEND][INGEST][FAILED]", { org_id: session.orgId, session_id: session.id });
      return refuse("server_error", 500);
    }

    void markInbound(connection.id);
    void recordInbound(session);
    if (!session.conversationId) await attachConversation(session.id, ingested.conversationId);

    console.info("[WEBCHAT][RECEIVED]", {
      org_id: session.orgId,
      conversation_id: ingested.conversationId,
      session_id: session.id,
    });

    await respondToInbound({
      orgId: session.orgId,
      channel: "web",
      conversationId: ingested.conversationId,
      contactId: ingested.contactId,
      threadId: session.id,
      connectionId: connection.id,
      agentId: connection.assignedAgentId,
      incoming: text,
    });

    // Everything since what the widget already had — the visitor's own message included, so the
    // widget can reconcile its optimistic bubble against what was actually stored.
    const messages = await loadThread(session.orgId, ingested.conversationId, {
      after: body?.after ?? null,
    });

    return allow(corsFor(origin), { ok: true, messages });
  } catch (err) {
    console.error("[WEBCHAT][SEND][ERROR]", err instanceof Error ? err.message : String(err));
    return refuse("server_error", 500);
  }
}

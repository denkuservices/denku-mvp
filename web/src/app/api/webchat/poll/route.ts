import { NextRequest } from "next/server";
import { getConnectionById } from "@/lib/webchat/connections";
import { getSessionById } from "@/lib/webchat/sessions";
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

export const dynamic = "force-dynamic";

/**
 * New messages since the widget last looked — how a human reply reaches the visitor.
 *
 * The AI's answer comes back in the `send` response, so this endpoint exists for the other
 * case: the shop owner reads the thread in the Inbox and types back, minutes later, from a
 * different machine entirely. Without it, the visitor would sit looking at an unanswered
 * question that has in fact been answered.
 *
 * **Why polling rather than a stream.** A server-sent stream would mean one function invocation
 * held open per open widget, on a platform billed by invocation duration, for a channel whose
 * traffic is mostly people who opened the widget and wandered off. Polling every few seconds
 * while the widget is OPEN — and not at all while it is closed or the tab is hidden — costs a
 * fraction of that and is indistinguishable to the visitor at chat speed. If a customer ever
 * needs true real-time, the widget switches to a stream and nothing else in the channel changes.
 *
 * **POST, not GET, on purpose.** The session token would otherwise sit in a query string, which
 * is exactly where credentials end up in access logs and referrer headers.
 */

interface Body {
  token?: string;
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

  const connection = await getConnectionById(claims.cid);
  const problem = connectionUsable(connection, origin);
  if (problem || !connection) return refuse(problem ?? "origin_not_allowed", 403);

  const session = await getSessionById(claims.sid);
  if (!session || session.orgId !== claims.org || session.connectionId !== connection.id) {
    return refuse("invalid_session", 401);
  }

  // No conversation yet means the visitor has not said anything. Nothing to report, and no
  // reason to touch `messages` at all.
  if (!session.conversationId) return allow(corsFor(origin), { ok: true, messages: [] });

  const messages = await loadThread(session.orgId, session.conversationId, {
    after: body?.after ?? null,
  });

  return allow(corsFor(origin), { ok: true, messages });
}

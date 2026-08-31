import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getConnectionById } from "@/lib/webchat/connections";
import { ensureSession } from "@/lib/webchat/sessions";
import { issueSessionToken, verifyFrameToken } from "@/lib/webchat/token";
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
 * Open (or resume) a Web Chat session — the widget's first call.
 *
 * It takes a **frame token**, not a site key. That token was minted by `/embed/chat` only after
 * the browser-set `Referer` proved the widget is running on an origin the customer allowed, so
 * by the time this route runs the allowlist decision has already been made and signed. Handing
 * the site key straight to this endpoint instead would mean the check happens where the browser
 * cannot be trusted to report it (see `lib/webchat/token.ts`).
 *
 * Deliberately side-effect-light: a session row is created — that is what makes a returning
 * visitor rejoin their thread — but **no conversation and no message**. A widget that is opened
 * and never typed into must not appear in the owner's Inbox as an empty conversation they feel
 * obliged to read.
 */

interface Body {
  frameToken?: string;
  /** Present on a return visit; the loader keeps it in the customer's own page storage. */
  visitorId?: string;
  pageUrl?: string;
  referrer?: string;
  locale?: string;
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const origin = requestOrigin(req);
  const body = await readJson<Body>(req);

  const frame = verifyFrameToken(body?.frameToken);
  if (!frame) return refuse("invalid_session", 401);

  const connection = await getConnectionById(frame.cid);
  const problem = connectionUsable(connection, origin);
  if (problem || !connection) {
    console.warn("[WEBCHAT][SESSION][REFUSED]", { reason: problem, embedded_on: frame.po });
    return refuse(problem ?? "origin_not_allowed", problem === "unknown_site" ? 404 : 403);
  }

  /**
   * The allowlist is re-read here, against the origin recorded in the frame token.
   *
   * The token proved that origin was allowed ten minutes ago. This proves it still is — so a
   * customer who removes a domain cuts off widgets already loaded on it, not just future ones.
   */
  const stillAllowed = connectionUsable(connection, frame.po);
  if (stillAllowed) {
    console.warn("[WEBCHAT][SESSION][ORIGIN_REVOKED]", { embedded_on: frame.po });
    return refuse("origin_not_allowed", 403);
  }

  // A visitor id from the client is accepted as given: it is a thread key, not a credential, and
  // the worst a forged one does is rejoin a conversation whose id the forger already knew.
  const visitorId = (body?.visitorId ?? "").trim().slice(0, 64) || randomUUID();

  const session = await ensureSession({
    connectionId: connection.id,
    orgId: connection.orgId,
    visitorId,
    pageUrl: body?.pageUrl ?? null,
    referrer: body?.referrer ?? null,
    userAgent: req.headers.get("user-agent"),
    locale: body?.locale ?? null,
  });

  if (!session) return refuse("rate_limited", 429);

  // A returning visitor sees the conversation they left, including anything the shop owner
  // typed back from the Inbox while they were away.
  const messages = session.conversationId
    ? await loadThread(connection.orgId, session.conversationId)
    : [];

  const token = issueSessionToken({
    cid: connection.id,
    org: connection.orgId,
    po: frame.po,
    sid: session.id,
    vid: visitorId,
  });

  return allow(corsFor(origin), {
    ok: true,
    token,
    visitorId,
    messages,
    // Branding is resolved server-side so the snippet stays two lines: the customer configures
    // the widget in Denku, not in their own HTML.
    widget: {
      displayName: connection.displayName || (await employeeName(connection.assignedAgentId)) || "Assistant",
      accentColor: connection.accentColor || null,
      greeting: connection.greeting || null,
    },
  });
}

/** The Employee's own name, so an unbranded widget still says who is answering. */
async function employeeName(agentId: string | null): Promise<string | null> {
  if (!agentId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("name")
      .eq("id", agentId)
      .maybeSingle<{ name: string | null }>();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

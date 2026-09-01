import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * A visitor's thread on one install, plus the volume caps that keep a public endpoint from
 * becoming a bill.
 *
 * **On the caps.** `lib/rateLimit.ts` is an in-memory Map and a no-op on Vercel (landmine #8),
 * so the only honest limiter is the database — the same conclusion the reply engine's spend
 * guard reached. That guard already caps how many replies a conversation and a workspace may
 * extract per hour, which is where the model bill actually lives. What it does NOT stop is a
 * script writing rows: an anonymous endpoint that appends to `messages` can fill a customer's
 * Inbox with junk without ever provoking an answer. These two caps close that:
 *
 *   - per conversation, how many inbound messages an hour — stops one open widget running away;
 *   - per install, how many NEW sessions an hour — stops the obvious way around the first cap,
 *     which is to rotate the visitor id and start a fresh thread every time.
 *
 * Both are counted, not stored, so there is no counter to drift and nothing to reset. Both fail
 * OPEN on a broken query: a failed count must never silence a real customer mid-sentence. That
 * is the house rule (fail open on gating) and it is safe here because the money-side guard —
 * the reply budget — fails open too but is bounded by the model timeout and the per-org ceiling
 * above it.
 */

export interface WebChatSession {
  id: string;
  connectionId: string;
  orgId: string;
  visitorId: string;
  conversationId: string | null;
  messageCount: number;
}

type Row = {
  id: string;
  connection_id: string;
  org_id: string;
  visitor_id: string;
  conversation_id: string | null;
  message_count: number | null;
};

const COLUMNS = "id, connection_id, org_id, visitor_id, conversation_id, message_count";

/** One open widget may send this many messages an hour. A person types perhaps 20. */
const MAX_INBOUND_PER_CONVERSATION_PER_HOUR = 60;

/**
 * One install may open this many brand-new visitor threads an hour.
 *
 * Sized against a busy shop, not against a quiet one: a site with real traffic might genuinely
 * see a hundred people open the widget in an hour. A script rotating visitor ids will pass this
 * in seconds, which is the point — it is a ceiling on abuse, not a throttle on customers.
 */
const MAX_NEW_SESSIONS_PER_CONNECTION_PER_HOUR = 300;

function toSession(row: Row): WebChatSession {
  return {
    id: row.id,
    connectionId: row.connection_id,
    orgId: row.org_id,
    visitorId: row.visitor_id,
    conversationId: row.conversation_id,
    messageCount: row.message_count ?? 0,
  };
}

export async function getSessionById(sessionId: string): Promise<WebChatSession | null> {
  if (!sessionId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("web_chat_sessions")
      .select(COLUMNS)
      .eq("id", sessionId)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toSession(data);
  } catch (err) {
    console.error("[WEBCHAT][SESSION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface EnsureSessionInput {
  connectionId: string;
  orgId: string;
  visitorId: string;
  pageUrl?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  locale?: string | null;
}

/**
 * Find this visitor's thread on this install, or open one.
 *
 * Upsert on `(connection_id, visitor_id)` so two tabs opening at once cannot produce two
 * sessions — and so a returning visitor rejoins the conversation the owner may already have
 * replied in, rather than starting a second thread the owner then sees as a new person.
 *
 * The page context is refreshed every time: what matters to a shop owner reading the thread is
 * which page the question came from, and that is the latest one, not the first.
 */
export async function ensureSession(input: EnsureSessionInput): Promise<WebChatSession | null> {
  const { connectionId, orgId, visitorId } = input;
  if (!connectionId || !orgId || !visitorId) return null;

  try {
    const existing = await supabaseAdmin
      .from("web_chat_sessions")
      .select(COLUMNS)
      .eq("connection_id", connectionId)
      .eq("visitor_id", visitorId)
      .maybeSingle<Row>();

    const context = {
      page_url: input.pageUrl?.slice(0, 2000) ?? null,
      referrer: input.referrer?.slice(0, 2000) ?? null,
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      locale: input.locale?.slice(0, 20) ?? null,
      last_seen_at: new Date().toISOString(),
    };

    if (existing.data) {
      // Best-effort refresh: a failed context update must not stop the visitor talking.
      void supabaseAdmin.from("web_chat_sessions").update(context).eq("id", existing.data.id);
      return toSession(existing.data);
    }

    // A new thread is the expensive one — it is the row an abuser wants many of.
    if (!(await withinNewSessionBudget(connectionId))) {
      console.warn("[WEBCHAT][SESSION][RATE_LIMITED]", { connection_id: connectionId });
      return null;
    }

    const inserted = await supabaseAdmin
      .from("web_chat_sessions")
      .upsert(
        { connection_id: connectionId, org_id: orgId, visitor_id: visitorId, ...context },
        { onConflict: "connection_id,visitor_id" }
      )
      .select(COLUMNS)
      .single<Row>();

    if (inserted.error || !inserted.data) {
      console.error("[WEBCHAT][SESSION][CREATE][FAILED]", inserted.error?.message);
      return null;
    }
    return toSession(inserted.data);
  } catch (err) {
    console.error("[WEBCHAT][SESSION][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Bind the session to the conversation ingest created.
 *
 * Written once, on the first message. It is what lets a later request read the thread back
 * without trusting the client for a conversation id.
 */
export async function attachConversation(sessionId: string, conversationId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("web_chat_sessions")
      .update({ conversation_id: conversationId })
      .eq("id", sessionId)
      .is("conversation_id", null);
  } catch (err) {
    console.error("[WEBCHAT][SESSION][ATTACH][FAILED]", err instanceof Error ? err.message : String(err));
  }
}

/** Bookkeeping the Channels card reads as "actually working". Never throws. */
export async function recordInbound(session: WebChatSession): Promise<void> {
  try {
    await supabaseAdmin
      .from("web_chat_sessions")
      .update({
        message_count: session.messageCount + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", session.id);
  } catch {
    /* never fail a delivery over a counter */
  }
}

/** How many inbound messages this conversation has taken in the last hour. Fails open. */
export async function withinInboundBudget(orgId: string, conversationId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .gte("created_at", since);
    if (error) return true;
    return (count ?? 0) < MAX_INBOUND_PER_CONVERSATION_PER_HOUR;
  } catch {
    return true;
  }
}

/** How many new visitor threads this install has opened in the last hour. Fails open. */
export async function withinNewSessionBudget(connectionId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("web_chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", connectionId)
      .gte("created_at", since);
    if (error) return true;
    return (count ?? 0) < MAX_NEW_SESSIONS_PER_CONNECTION_PER_HOUR;
  } catch {
    return true;
  }
}

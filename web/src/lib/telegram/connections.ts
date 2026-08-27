import "server-only";

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret, isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { getMe, setWebhook, deleteWebhook, isPlausibleBotToken, describeToken } from "@/lib/telegram/api";
import { telegramWebhookUrl } from "@/lib/telegram/webhookUrl";

/**
 * Telegram connection lifecycle: connect a customer's own bot, resolve it on inbound, drop it.
 *
 * The decision this file encodes (2026-08-27): **each business brings its own BotFather bot.**
 * That makes the token a per-tenant credential we hold on their behalf, so:
 *   - it is encrypted before it is stored, and the connect path REFUSES to store it at all
 *     when no encryption key is configured — a plaintext fallback would be silent and wrong;
 *   - `bot_id` is globally unique, so a token pasted into a second workspace is rejected
 *     rather than quietly stealing the first workspace's conversations;
 *   - decryption happens in exactly two places (send a reply, re-point the webhook) and the
 *     plaintext never leaves this module's callers.
 *
 * The webhook secret is ours, not Telegram's: Telegram signs nothing, it only echoes back the
 * `secret_token` we registered. That echo is the entire authentication for inbound updates,
 * which is why it is 32 random bytes per connection and lives in a header, never in the URL.
 */

export interface TelegramConnection {
  id: string;
  orgId: string;
  botId: string;
  botUsername: string | null;
  botName: string | null;
  webhookSecret: string;
  assignedAgentId: string | null;
  status: "connected" | "revoked" | "error";
  lastError: string | null;
  lastInboundAt: string | null;
  createdAt: string;
}

type Row = {
  id: string;
  org_id: string;
  bot_id: string;
  bot_username: string | null;
  bot_name: string | null;
  webhook_secret: string;
  assigned_agent_id: string | null;
  status: TelegramConnection["status"];
  last_error: string | null;
  last_inbound_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, org_id, bot_id, bot_username, bot_name, webhook_secret, assigned_agent_id, status, last_error, last_inbound_at, created_at";

function toConnection(row: Row): TelegramConnection {
  return {
    id: row.id,
    orgId: row.org_id,
    botId: row.bot_id,
    botUsername: row.bot_username,
    botName: row.bot_name,
    webhookSecret: row.webhook_secret,
    assignedAgentId: row.assigned_agent_id,
    status: row.status,
    lastError: row.last_error,
    lastInboundAt: row.last_inbound_at,
    createdAt: row.created_at,
  };
}

/** Inbound resolution: the connection a delivery claims to be for. Never throws. */
export async function getConnectionById(connectionId: string): Promise<TelegramConnection | null> {
  if (!connectionId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("telegram_connections")
      .select(COLUMNS)
      .eq("id", connectionId)
      .maybeSingle<Row>();
    if (error || !data) return null;
    return toConnection(data);
  } catch (err) {
    console.error("[TELEGRAM][CONNECTION][LOOKUP][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function listConnections(orgId: string): Promise<TelegramConnection[]> {
  if (!orgId) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from("telegram_connections")
      .select(COLUMNS)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Row[]).map(toConnection);
  } catch (err) {
    console.error("[TELEGRAM][CONNECTION][LIST][ERROR]", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * The decrypted token for outbound sends. Isolated here so `bot_token_encrypted` is selected
 * in exactly one query and the plaintext has one short life.
 */
export async function getBotToken(connectionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("telegram_connections")
      .select("bot_token_encrypted")
      .eq("id", connectionId)
      .maybeSingle<{ bot_token_encrypted: string }>();
    if (error || !data?.bot_token_encrypted) return null;
    return decryptSecret(data.bot_token_encrypted);
  } catch (err) {
    console.error("[TELEGRAM][TOKEN][DECRYPT][FAILED]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface ConnectResult {
  ok: boolean;
  connection?: TelegramConnection;
  /** A sentence a shop owner can act on — shown in the UI verbatim. */
  error?: string;
}

/**
 * Connect (or re-connect) a bot from a pasted BotFather token.
 *
 * Order matters and is deliberate: verify the token with Telegram FIRST, store SECOND, then
 * register the webhook. Storing before verifying would leave dead connections in the list for
 * every typo; registering before storing would point a live bot at a connection id that does
 * not exist yet, and its first message would 404.
 */
export async function connectBot(input: {
  orgId: string;
  token: string;
  connectedBy?: string | null;
  assignedAgentId?: string | null;
}): Promise<ConnectResult> {
  const { orgId } = input;
  const token = (input.token ?? "").trim();

  if (!orgId) return { ok: false, error: "No workspace." };
  if (!isPlausibleBotToken(token)) {
    return {
      ok: false,
      error: "That does not look like a bot token. BotFather gives you something like 123456789:AAH… — paste the whole line.",
    };
  }
  if (!isSecretBoxConfigured()) {
    // Refusing is the correct failure: storing this in plaintext would be a silent downgrade
    // of a credential that can post as the customer's business.
    console.error("[TELEGRAM][CONNECT][NO_ENCRYPTION_KEY]");
    return { ok: false, error: "Telegram is not configured on this deployment yet. Contact support." };
  }

  // 1) Does this token actually work, and whose bot is it?
  const me = await getMe(token);
  if (!me.ok || !me.result?.id) {
    console.warn("[TELEGRAM][CONNECT][GETME][FAILED]", { bot: describeToken(token), reason: me.description });
    return {
      ok: false,
      error:
        me.errorCode === 401
          ? "Telegram rejected that token. If you regenerated it in BotFather, paste the newest one."
          : `Could not reach Telegram: ${me.description ?? "unknown error"}`,
    };
  }

  const botId = String(me.result.id);

  // A bot serves one workspace. Without this check the unique index would reject the insert
  // with a database error the customer cannot interpret.
  const { data: existingElsewhere } = await supabaseAdmin
    .from("telegram_connections")
    .select("id, org_id")
    .eq("bot_id", botId)
    .maybeSingle<{ id: string; org_id: string }>();

  if (existingElsewhere && existingElsewhere.org_id !== orgId) {
    console.warn("[TELEGRAM][CONNECT][BOT_CLAIMED]", { botId });
    return { ok: false, error: "That bot is already connected to another Denku workspace." };
  }

  // 2) Store. Re-connecting the same bot rotates the token and the webhook secret in place,
  //    keeping the connection id — so its conversations stay attached to it.
  const row = {
    org_id: orgId,
    bot_id: botId,
    bot_username: me.result.username ?? null,
    bot_name: me.result.first_name ?? null,
    bot_token_encrypted: encryptSecret(token),
    webhook_secret: randomBytes(32).toString("hex"),
    status: "connected" as const,
    last_error: null,
    connected_by: input.connectedBy ?? null,
    ...(input.assignedAgentId ? { assigned_agent_id: input.assignedAgentId } : {}),
  };

  const saved = existingElsewhere
    ? await supabaseAdmin
        .from("telegram_connections")
        .update(row)
        .eq("id", existingElsewhere.id)
        .eq("org_id", orgId)
        .select(COLUMNS)
        .single<Row>()
    : await supabaseAdmin.from("telegram_connections").insert(row).select(COLUMNS).single<Row>();

  if (saved.error || !saved.data) {
    console.error("[TELEGRAM][CONNECT][SAVE][FAILED]", saved.error?.message);
    return { ok: false, error: "Could not save the connection. Try again." };
  }

  const connection = toConnection(saved.data);

  // 3) Point the bot at us.
  const url = telegramWebhookUrl(connection.id);
  if (!url) {
    await markError(connection.id, "No public webhook URL is configured for this deployment.");
    console.error("[TELEGRAM][CONNECT][NO_BASE_URL]");
    return {
      ok: false,
      error: "This deployment has no public address configured, so Telegram cannot reach it yet.",
    };
  }

  const hook = await setWebhook(token, url, connection.webhookSecret);
  if (!hook.ok) {
    await markError(connection.id, hook.description ?? "setWebhook failed");
    console.error("[TELEGRAM][CONNECT][SETWEBHOOK][FAILED]", { botId, reason: hook.description });
    return { ok: false, error: `Telegram would not accept our address: ${hook.description ?? "unknown error"}` };
  }

  await supabaseAdmin
    .from("telegram_connections")
    .update({ webhook_set_at: new Date().toISOString(), status: "connected", last_error: null })
    .eq("id", connection.id)
    .eq("org_id", orgId);

  console.info("[TELEGRAM][CONNECT][OK]", { botId, username: connection.botUsername, connectionId: connection.id });
  return { ok: true, connection };
}

/** Stop receiving, and stop holding a working credential. */
export async function disconnectBot(orgId: string, connectionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!orgId || !connectionId) return { ok: false, error: "Missing connection." };

  const token = await getBotToken(connectionId);
  if (token) {
    const removed = await deleteWebhook(token);
    if (!removed.ok) {
      // Non-fatal: we still drop our side. A bot that keeps posting at a deleted connection
      // gets a 404 and stops on its own.
      console.warn("[TELEGRAM][DISCONNECT][DELETEWEBHOOK][FAILED]", { reason: removed.description });
    }
  }

  const { error } = await supabaseAdmin
    .from("telegram_connections")
    .delete()
    .eq("id", connectionId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[TELEGRAM][DISCONNECT][FAILED]", error.message);
    return { ok: false, error: "Could not disconnect. Try again." };
  }
  console.info("[TELEGRAM][DISCONNECT][OK]", { connectionId });
  return { ok: true };
}

/** Which AI Employee answers on this bot. */
export async function assignEmployee(
  orgId: string,
  connectionId: string,
  agentId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("telegram_connections")
    .update({ assigned_agent_id: agentId })
    .eq("id", connectionId)
    .eq("org_id", orgId);
  if (error) {
    console.error("[TELEGRAM][ASSIGN][FAILED]", error.message);
    return { ok: false, error: "Could not assign that employee." };
  }
  return { ok: true };
}

/** Record a provider-side problem so the Channels card can surface it (connectionHealth). */
export async function markError(connectionId: string, message: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("telegram_connections")
      .update({ status: "error", last_error: message.slice(0, 500) })
      .eq("id", connectionId);
  } catch {
    /* health reporting must never be the thing that fails */
  }
}

/** Touch on successful inbound — the difference between "configured" and "actually working". */
export async function markInbound(connectionId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("telegram_connections")
      .update({ last_inbound_at: new Date().toISOString(), status: "connected", last_error: null })
      .eq("id", connectionId);
  } catch {
    /* never fail a delivery over a timestamp */
  }
}

import "server-only";

/**
 * Telegram Bot API client — the whole surface Denku uses, and nothing more.
 *
 * Four methods: identify a bot (`getMe`), point it at us (`setWebhook`), let it go
 * (`deleteWebhook`), and speak (`sendMessage` / `sendChatAction`). Everything else Telegram
 * offers is out of scope until a feature actually needs it.
 *
 * Two rules the rest of the codebase depends on:
 *
 * 1. **Nothing here throws.** Every call returns `{ ok }` plus a description, because both
 *    callers are hot paths where an exception would be the wrong outcome: a webhook that
 *    throws makes Telegram retry the same update forever, and a connect form that throws
 *    tells the customer nothing about what was wrong with their token.
 * 2. **The token never reaches a log.** It lives in the URL path (Telegram's design, not
 *    ours), so no URL from this module may be logged verbatim — `describeToken` is the only
 *    thing that should ever be printed.
 */

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 8000;

/** BotFather tokens look like `123456789:AA…` — id, colon, ~35 url-safe chars. */
const TOKEN_SHAPE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

export function isPlausibleBotToken(token: string | null | undefined): boolean {
  return TOKEN_SHAPE.test((token ?? "").trim());
}

/** Safe rendering of a token for logs/errors: the bot id, then nothing that authenticates. */
export function describeToken(token: string | null | undefined): string {
  const t = (token ?? "").trim();
  const id = t.split(":")[0];
  return id && /^\d+$/.test(id) ? `bot ${id}` : "bot <malformed>";
}

export interface TelegramResult<T> {
  ok: boolean;
  result?: T;
  /** Telegram's own message on failure, or ours for transport/timeout errors. */
  description?: string;
  errorCode?: number;
}

async function callApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>
): Promise<TelegramResult<T>> {
  if (!isPlausibleBotToken(token)) {
    return { ok: false, description: "Malformed bot token" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string; error_code?: number }
      | null;

    if (!payload || payload.ok !== true) {
      return {
        ok: false,
        description: payload?.description ?? `HTTP ${res.status}`,
        errorCode: payload?.error_code ?? res.status,
      };
    }
    return { ok: true, result: payload.result };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, description: aborted ? `Timed out after ${TIMEOUT_MS}ms` : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

export interface TelegramBotIdentity {
  id: number;
  username?: string;
  first_name?: string;
  is_bot?: boolean;
  can_read_all_group_messages?: boolean;
}

/** Verify a token and learn who the bot is. The connect flow's proof that a token works. */
export function getMe(token: string) {
  return callApi<TelegramBotIdentity>(token, "getMe");
}

/**
 * Point the bot at our webhook.
 *
 * `secret_token` is the whole authentication story for this channel — Telegram echoes it in
 * the `X-Telegram-Bot-Api-Secret-Token` header and signs nothing else. `allowed_updates`
 * is deliberately narrow: we handle private messages, so asking for edits, polls, channel
 * posts and reactions would be traffic we pay to receive and then drop.
 */
export function setWebhook(token: string, url: string, secretToken: string) {
  return callApi<boolean>(token, "setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message"],
    // A stale queue from a previous connection is not this bot's history — it is a burst of
    // messages nobody is expecting a reply to any more.
    drop_pending_updates: true,
    max_connections: 40,
  });
}

export function deleteWebhook(token: string) {
  return callApi<boolean>(token, "deleteWebhook", { drop_pending_updates: true });
}

export interface TelegramSentMessage {
  message_id: number;
  chat?: { id: number };
  date?: number;
}

/**
 * Send a reply. Plain text on purpose: Markdown/HTML parse modes make Telegram reject the
 * whole message when a model emits an unbalanced `*`, and a dropped reply is a worse
 * outcome than an unstyled one.
 */
export function sendMessage(token: string, chatId: string | number, text: string) {
  return callApi<TelegramSentMessage>(token, "sendMessage", {
    chat_id: chatId,
    // Telegram hard-rejects anything over 4096 characters.
    text: text.slice(0, 4096),
    disable_web_page_preview: true,
  });
}

/** The "typing…" indicator. Best-effort courtesy while the model thinks; expires in ~5s. */
export function sendChatAction(token: string, chatId: string | number, action = "typing") {
  return callApi<boolean>(token, "sendChatAction", { chat_id: chatId, action });
}

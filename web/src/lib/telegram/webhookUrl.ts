/**
 * Where Telegram should deliver updates for one connection.
 *
 * Pure and dependency-free on purpose — it is config arithmetic, and keeping it out of
 * `connections.ts` means it can be reasoned about (and tested) without a database client.
 *
 * The connection id is in the path because a Telegram update carries no hint of which bot it
 * was sent to; without it we would have to try every stored token. The id is not a credential
 * and grants nothing on its own — the `X-Telegram-Bot-Api-Secret-Token` header authenticates.
 *
 * Refuses localhost for the same reason `assistantConfig` does: a dev machine's URL frozen into
 * a provider's config is a production outage that looks like silence (R-077).
 */
export function telegramWebhookUrl(connectionId: string, env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.TELEGRAM_WEBHOOK_BASE_URL || env.VAPI_WEBHOOK_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!base) return "";
  if (/localhost|127\.0\.0\.1/.test(base)) return "";
  return `${base}/api/webhooks/telegram/${connectionId}`;
}

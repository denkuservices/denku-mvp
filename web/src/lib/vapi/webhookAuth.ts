import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Authentication for the inbound Vapi webhook (R-001).
 *
 * Vapi is configured to send a custom `x-vapi-secret` header (see the assistant's
 * `server.headers` in the Vapi dashboard) whose value is `VAPI_WEBHOOK_SECRET`.
 * This module verifies that header. The same header name also covers Vapi's native
 * `server.secret` mechanism, so it works regardless of which the dashboard uses.
 *
 * STAGED ROLLOUT — `VAPI_WEBHOOK_AUTH_MODE` (never drop live ingestion on deploy):
 *   - "off"     → do not check (webhook stays open; pre-R-001 behavior).
 *   - "log"     → check and log mismatches, but STILL PROCESS the request (observe-only).
 *   - "enforce" → reject non-matching requests with 401.
 * Default when unset: "log" if a secret is configured, else "off". Enforcement is an
 * explicit opt-in you flip only after confirming (via the canary logs) that real Vapi
 * calls carry a matching header — otherwise a mis-staged rollout would silently lose
 * every live call. Enforcement is also impossible without a secret, so a missing
 * `VAPI_WEBHOOK_SECRET` can never lock ingestion out.
 */
export type WebhookAuthMode = "off" | "log" | "enforce";

/** The header Vapi sends when a server secret / custom header is configured. */
export const VAPI_SECRET_HEADER = "x-vapi-secret";

export function getWebhookAuthMode(env: NodeJS.ProcessEnv = process.env): WebhookAuthMode {
  const raw = (env.VAPI_WEBHOOK_AUTH_MODE ?? "").toLowerCase().trim();
  if (raw === "off" || raw === "log" || raw === "enforce") return raw;
  return env.VAPI_WEBHOOK_SECRET ? "log" : "off";
}

/**
 * Constant-time string comparison that does not leak length via early return.
 * (timingSafeEqual throws on length mismatch, so we normalize timing and return false.)
 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab); // spend comparable time; result discarded
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export type WebhookAuthResult = {
  mode: WebhookAuthMode;
  hasSecret: boolean;
  headerPresent: boolean;
  matched: boolean;
  /** True only when mode=enforce, a secret is configured, and the header did not match. */
  shouldReject: boolean;
};

/**
 * Evaluate a request's Vapi webhook auth. `getHeader` is passed in (rather than a
 * Request) so this stays pure and unit-testable.
 */
export function checkVapiWebhookAuth(
  getHeader: (name: string) => string | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): WebhookAuthResult {
  const mode = getWebhookAuthMode(env);
  const secret = env.VAPI_WEBHOOK_SECRET ?? "";
  const hasSecret = secret.length > 0;
  const provided = getHeader(VAPI_SECRET_HEADER) ?? "";
  const headerPresent = provided.length > 0;
  const matched = hasSecret && headerPresent ? safeEqual(provided, secret) : false;

  // Can only enforce when a secret is configured — never lock out ingestion by misconfig.
  const shouldReject = mode === "enforce" && hasSecret && !matched;
  return { mode, hasSecret, headerPresent, matched, shouldReject };
}

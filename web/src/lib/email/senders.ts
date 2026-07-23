/**
 * Centralized email "From" senders (R-080).
 *
 * Single source of truth for every transactional `from:` address. All senders
 * resolve to the VERIFIED `denku.io` domain — the legacy sandbox
 * `onboarding@resend.dev` is eliminated (it could only deliver to the account
 * owner, so auth emails silently failed in prod).
 *
 * Resolution order per stream: `RESEND_FROM_<STREAM>` → `RESEND_FROM` (global
 * override) → verified-domain default. Pure and env-injectable so it can be
 * unit-tested without touching Resend or the network.
 */

export type SenderKind = "auth" | "notify" | "welcome";

/** Verified-domain defaults. Never a sandbox address. */
export const DEFAULT_SENDERS: Record<SenderKind, string> = {
  auth: "Denku <no-reply@denku.io>", // verification / OTP / password-reset
  notify: "Denku <notifications@denku.io>", // artifact notifications, digests
  welcome: "Denku <hello@denku.io>", // welcome + human-reply-friendly
};

/** Per-stream env override keys. */
const ENV_KEYS: Record<SenderKind, string> = {
  auth: "RESEND_FROM_AUTH",
  notify: "RESEND_FROM_NOTIFY",
  welcome: "RESEND_FROM_WELCOME",
};

type Env = Record<string, string | undefined>;

/**
 * Resolve the `from:` address for an email stream.
 * Per-stream override → global `RESEND_FROM` → verified default. Blank/whitespace
 * env values are ignored (fall through to the next source).
 */
export function resolveSender(kind: SenderKind, env: Env = process.env): string {
  const perStream = env[ENV_KEYS[kind]]?.trim();
  if (perStream) return perStream;

  const global = env.RESEND_FROM?.trim();
  if (global) return global;

  return DEFAULT_SENDERS[kind];
}

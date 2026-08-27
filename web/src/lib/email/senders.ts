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
 * Clean up a sender pasted into a dashboard.
 *
 * A `from` of `"Denku AI <hello@denku.io>"` — **with the quote characters in the value** — is what
 * you get when someone copies the shell form of the variable into Vercel's UI, and Resend answers
 * it with a 422 `validation_error`. That happened in production on 2026-08-27: the artifact
 * notification path was correct end to end, the flag was on, the recipient was configured, and
 * every email silently failed on the shape of one string. Nothing in the UI could show it, because
 * the send is best-effort by design and releases its claim on failure.
 *
 * A wrapping pair of quotes is never part of a real address, so stripping it can only help.
 */
function sanitizeSender(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const unquoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1).trim()
      : value;
  return unquoted;
}

/**
 * Resolve the `from:` address for an email stream.
 * Per-stream override → global `RESEND_FROM` → verified default. Blank/whitespace
 * env values are ignored (fall through to the next source).
 */
export function resolveSender(kind: SenderKind, env: Env = process.env): string {
  const perStream = sanitizeSender(env[ENV_KEYS[kind]]);
  if (perStream) return perStream;

  const global = sanitizeSender(env.RESEND_FROM);
  if (global) return global;

  return DEFAULT_SENDERS[kind];
}

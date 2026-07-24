/**
 * Support contact (Sprint 6, L4 / R-047).
 *
 * A single source of truth for how a customer reaches a human. The address is configurable
 * via `NEXT_PUBLIC_SUPPORT_EMAIL` so the operator points it at a monitored inbox (the
 * preflight warns until it's set). Default is a sensible brand address — confirm it's
 * monitored before launch. `mailto:` is a guaranteed-working affordance (opens the user's
 * mail client), unlike a form that silently no-ops.
 */
export const DEFAULT_SUPPORT_EMAIL = "support@denku.io";

export function getSupportEmail(env: Record<string, string | undefined> = process.env): string {
  const v = (env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "").trim();
  return v.length > 0 ? v : DEFAULT_SUPPORT_EMAIL;
}

export function getSupportMailto(subject = "Denku support", env: Record<string, string | undefined> = process.env): string {
  return `mailto:${getSupportEmail(env)}?subject=${encodeURIComponent(subject)}`;
}

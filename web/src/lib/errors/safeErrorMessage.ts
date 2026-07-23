/**
 * safeErrorMessage (R-021) — map any thrown/returned error to a user-safe string.
 *
 * The rule (CLAUDE.md convention): log full detail server-side; show the user a safe,
 * non-leaky message. This helper NEVER returns a raw Supabase/Vapi/Stripe/Postgres
 * error string — it recognizes a few clearly-safe categories and otherwise returns a
 * generic fallback. Pure + dependency-free so it works on client and server and is
 * unit-testable.
 *
 * Logging is the caller's responsibility (e.g. `console.error(err)` /
 * `logEvent(...)`) — kept out of here so the function stays pure.
 */

export const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";

function rawMessage(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

export function safeErrorMessage(err: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  const raw = rawMessage(err).toLowerCase().trim();
  if (!raw) return fallback;

  // Only a handful of clearly-safe, non-leaky categories get a tailored message.
  if (
    raw.includes("failed to fetch") ||
    raw.includes("network") ||
    raw.includes("timeout") ||
    raw.includes("timed out")
  ) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (raw.includes("rate limit") || raw.includes("too many")) {
    return "Too many requests. Please wait a moment and try again.";
  }
  if (
    raw.includes("unauthorized") ||
    raw.includes("not authenticated") ||
    raw.includes("session expired") ||
    raw.includes("jwt expired")
  ) {
    return "Your session has expired. Please sign in again.";
  }
  if (
    raw.includes("forbidden") ||
    raw.includes("permission denied") ||
    raw.includes("not allowed")
  ) {
    return "You don't have permission to do that.";
  }

  // Anything else: never surface the raw provider string.
  return fallback;
}

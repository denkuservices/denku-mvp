/**
 * Password policy — the single source of truth for what counts as an acceptable
 * new password across the auth surfaces (signup set-password, forgot-password reset).
 *
 * Pure and dependency-free so it can be unit-tested under Node (R-037 harness) and
 * reused without pulling in Supabase / next/headers. Server actions wrap this and
 * perform the actual `updateUser` I/O.
 *
 * NOTE: `verify-email/_actions/setPassword.ts` currently inlines an equivalent zod
 * schema; it can adopt this helper opportunistically. It is intentionally NOT changed
 * here to keep the signup critical path untouched in this change (R-011 scope).
 */

/** Minimum length for a user-chosen password. Matches the existing signup rule. */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordValidationResult =
  | { ok: true; password: string }
  | { ok: false; error: string };

/**
 * Validate a new-password / confirm-password pair.
 * Deterministic, never throws — returns a user-safe message on failure.
 */
export function validatePasswordChange(input: {
  password: unknown;
  confirmPassword: unknown;
}): PasswordValidationResult {
  const { password, confirmPassword } = input;

  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return { ok: false, error: "Password is required." };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }

  return { ok: true, password };
}

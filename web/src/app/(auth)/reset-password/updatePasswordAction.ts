"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validatePasswordChange } from "@/lib/auth/passwordPolicy";

export type UpdatePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Set a new password for the user authenticated by the recovery session (R-011).
 *
 * Mirrors the proven `verify-email/_actions/setPassword.ts` shape: it requires an
 * active session (established by `/auth/reset-callback` exchanging the recovery
 * code), validates via the shared password policy, then `updateUser({ password })`.
 * If there is no session (expired/mis-routed link), it fails safe with a message
 * telling the user to request a new link — it never changes an unauthenticated
 * user's password.
 */
export async function updatePasswordAction(
  formData: FormData
): Promise<UpdatePasswordResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Must be authenticated via the recovery session.
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    return {
      ok: false,
      error: "Your reset link has expired. Please request a new one.",
    };
  }

  // 2) Validate the new password (shared, unit-tested policy).
  const validation = validatePasswordChange({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // 3) Apply the change.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: validation.password,
  });

  if (updateErr) {
    console.error("[updatePassword] Update failed:", updateErr.message);
    return { ok: false, error: "Could not update your password. Please try again." };
  }

  return { ok: true };
}

"use server";

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validatePasswordChange, PASSWORD_MIN_LENGTH } from "@/lib/auth/passwordPolicy";
import { getAuthLocale } from "@/i18n/authLocale";
import { notifyPasswordChanged } from "@/lib/notifications/securityNotifications";

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
  const t = await getTranslations({ locale: await getAuthLocale(), namespace: "auth.errors" });
  const supabase = await createSupabaseServerClient();

  // 1) Must be authenticated via the recovery session.
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    return { ok: false, error: t("resetLinkExpired") };
  }

  // 2) Validate the new password (shared, unit-tested policy).
  const validation = validatePasswordChange({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!validation.ok) {
    const message =
      validation.reason === "required"
        ? t("passwordRequired")
        : validation.reason === "mismatch"
          ? t("passwordMismatch")
          : t("passwordTooShort", { min: PASSWORD_MIN_LENGTH });
    return { ok: false, error: message };
  }

  // 3) Apply the change.
  const { error: updateErr } = await supabase.auth.updateUser({
    password: validation.password,
  });

  if (updateErr) {
    console.error("[updatePassword] Update failed:", updateErr.message);
    return { ok: false, error: t("resetFailed") };
  }

  // 4) Confirm the change by email. This is the notification that tells someone their
  // account was taken over, so it goes out on every successful change and is not behind
  // a feature flag. It never throws: the password IS changed at this point, and failing
  // the action would tell the user the opposite of the truth.
  if (user.email) {
    await notifyPasswordChanged({ userId: user.id, email: user.email });
  }

  return { ok: true };
}

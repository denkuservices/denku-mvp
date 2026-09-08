"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { getAuthLocale } from "@/i18n/authLocale";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

const SetPasswordSchema = z.object({
  password: z.string().min(8, "tooShort"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "mismatch",
  path: ["confirmPassword"],
});

/**
 * `code` exists because the form has to tell one failure apart from the others: an expired
 * session is the only one it can offer a way out of ("resend the code"). It used to do that by
 * matching English words inside `error`, which stopped being a stable thing to match on the day
 * the message was translated.
 */
export type SetPasswordResult =
  | { ok: true }
  | { ok: false; error: string; code?: "SESSION_EXPIRED" };

export async function setPasswordAction(
  password: string,
  confirmPassword: string,
  orgName: string,
  fullName: string
): Promise<SetPasswordResult> {
  const t = await getTranslations({ locale: await getAuthLocale(), namespace: "auth" });

  // Create Supabase server client with cookie-aware setup
  // This ensures auth cookies are persisted after updateUser
  const supabase = await createSupabaseServerClient();

  // 1) Get current user (must be authenticated after OTP verification)
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("[setPassword] Session missing before update:", getUserError?.message);
    return { ok: false, error: t("errors.sessionExpired"), code: "SESSION_EXPIRED" };
  }

  // 2) Validate password
  const validation = SetPasswordSchema.safeParse({ password, confirmPassword });
  if (!validation.success) {
    const issue = validation.error.issues?.[0]?.message;
    const key = issue === "mismatch" ? "verify.mismatch" : "verify.tooShort";
    return { ok: false, error: t(key) };
  }

  // 3) Set password
  const { error: updateErr } = await supabase.auth.updateUser({
    password: validation.data.password,
  });

  if (updateErr) {
    console.error("[setPassword] Password update error:", updateErr.message);
    return { ok: false, error: t("errors.setPasswordFailed") };
  }

  // 4) CRITICAL: Verify session is still valid after updateUser
  // This ensures cookies were persisted and session is readable
  // Access cookie store to ensure cookie writes are committed.
  // Intentionally called for its effect only — do not remove.
  await cookies();

  // Verify session persists by calling getUser again
  const {
    data: { user: updatedUser },
    error: sessionVerifyError,
  } = await supabase.auth.getUser();

  if (sessionVerifyError || !updatedUser) {
    console.error("[setPassword] Session lost after updateUser:", sessionVerifyError?.message);
    return { ok: false, error: t("errors.sessionExpired"), code: "SESSION_EXPIRED" };
  }

  // 5) Session is confirmed valid - return success
  // Client will handle navigation to /onboarding
  // Org/workspace/full_name/phone will be collected in onboarding step 0
  return { ok: true };
}


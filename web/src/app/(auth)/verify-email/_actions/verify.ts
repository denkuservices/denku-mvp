"use server";

import { getTranslations } from "next-intl/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthLocale } from "@/i18n/authLocale";
import { getBaseUrl } from "@/lib/utils/url";
import { resolveRequestEmailLocale } from "@/lib/email/locale.server";

export type VerifyOtpResult =
  | { ok: true; needsPassword: boolean }
  | { ok: false; error: string };

export async function verifyOtpAction(email: string, token: string): Promise<VerifyOtpResult> {
  const t = await getTranslations({ locale: await getAuthLocale(), namespace: "auth.errors" });
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { ok: false, error: t("invalidCode") };
  }

  if (!data.user) {
    return { ok: false, error: t("verifyFailed") };
  }

  const locale = await resolveRequestEmailLocale();
  await supabase.auth.updateUser({ data: { ui_locale: locale } });

  // When using OTP sign-in with shouldCreateUser: true, user is created without password
  // So user always needs to set password after OTP verification
  // We no longer depend on email_confirmed_at via link; OTP is primary verification
  return { ok: true, needsPassword: true };
}

export async function resendCodeAction(email: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getTranslations({ locale: await getAuthLocale(), namespace: "auth.errors" });
  const supabase = await createSupabaseServerClient();
  const locale = await resolveRequestEmailLocale();

  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  // Request OTP from Supabase (this generates the code)
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
      data: { ui_locale: locale },
    },
  });

  if (error) {
    return { ok: false, error: t("resendFailed") };
  }

  // Note: Supabase's signInWithOtp automatically sends the OTP email
  // To fully use Resend for OTP, you would need to:
  // 1. Disable Supabase email sending in Supabase dashboard
  // 2. Extract the OTP code from Supabase's response (not directly available via API)
  // 3. Send via Resend using sendOtpEmail
  // For now, Supabase handles OTP sending automatically

  return { ok: true };
}


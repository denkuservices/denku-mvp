"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

export type VerifyOtpResult =
  | { ok: true; needsPassword: boolean }
  | { ok: false; error: string };

export async function verifyOtpAction(email: string, token: string): Promise<VerifyOtpResult> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) {
    return { ok: false, error: "Invalid verification code. Please try again." };
  }

  if (!data.user) {
    return { ok: false, error: "Verification failed. Please try again." };
  }

  // Check if email is confirmed after OTP verification
  const emailConfirmed = (data.user as any).email_confirmed_at || (data.user as any).confirmed_at;
  
  // When using OTP sign-in with shouldCreateUser: true, user always needs to set password
  // (user is created without password)
  // For email+password signup flow, if email is confirmed, password should already be set
  const needsPassword = !emailConfirmed;

  return { ok: true, needsPassword };
}

export async function resendCodeAction(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();

  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  // Request OTP from Supabase (this generates the code)
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, error: "Failed to resend code. Please try again." };
  }

  // Note: Supabase's signInWithOtp automatically sends the OTP email
  // To fully use Resend for OTP, you would need to:
  // 1. Disable Supabase email sending in Supabase dashboard
  // 2. Extract the OTP code from Supabase's response (not directly available via API)
  // 3. Send via Resend using sendOtpEmail
  // For now, Supabase handles OTP sending automatically

  return { ok: true };
}


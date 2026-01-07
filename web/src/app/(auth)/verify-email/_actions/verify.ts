"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  // When using OTP sign-in with shouldCreateUser: true, user always needs to set password
  // (user is created without password)
  return { ok: true, needsPassword: true };
}

export async function resendCodeAction(email: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();

  function getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }

  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, error: "Failed to resend code. Please try again." };
  }

  return { ok: true };
}


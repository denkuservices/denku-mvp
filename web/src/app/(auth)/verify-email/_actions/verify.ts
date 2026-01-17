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

  // TEMP: Debug log cookie names (not values) in development only
  if (process.env.NODE_ENV !== "production") {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieNames = cookieStore.getAll().map((c: any) => c.name).filter((name: string) => 
      name.includes("auth-token") || name.includes("supabase") || name.includes("sb-")
    );
    console.log("[verifyOtpAction] Auth cookies after verifyOtp:", {
      cookieNames,
      hasUser: !!data.user,
    });
  }

  // When using OTP sign-in with shouldCreateUser: true, user is created without password
  // So user always needs to set password after OTP verification
  // We no longer depend on email_confirmed_at via link; OTP is primary verification
  return { ok: true, needsPassword: true };
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


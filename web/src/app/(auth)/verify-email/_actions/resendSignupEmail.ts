"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResendSignupEmailResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Resend OTP code via Supabase signInWithOtp.
 * Uses shouldCreateUser: true to create user if not exists.
 */
export async function resendSignupEmailAction(
  email: string
): Promise<ResendSignupEmailResult> {
  if (!email || !email.trim()) {
    return {
      ok: false,
      error: "Missing email",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();

    // Resend OTP code via Supabase
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      // Log server-side for debugging
      console.error("[resendSignupEmailAction] Supabase OTP error:", error.message, error.status);

      // Return user-friendly error (do NOT throw to prevent SSR crash)
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes("rate limit") ||
        errorMsg.includes("too many") ||
        error.status === 429
      ) {
        return { ok: false, error: "Too many requests. Please wait a moment and try again." };
      }

      if (
        errorMsg.includes("invalid") ||
        errorMsg.includes("email") ||
        error.status === 400
      ) {
        return { ok: false, error: "Please enter a valid email address." };
      }

      // Generic error
      return { ok: false, error: "Failed to resend code. Please try again." };
    }

    return {
      ok: true,
      message: "Code sent. Check your email.",
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[resendSignupEmailAction] Unexpected error:", errorMsg);
    return { ok: false, error: "An unexpected error occurred. Please try again." };
  }
}


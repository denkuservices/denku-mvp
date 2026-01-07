"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

export type ResendSignupEmailResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: "USER_EXISTS" | "UNKNOWN" };

export async function resendSignupEmailAction(
  email: string
): Promise<ResendSignupEmailResult> {
  const supabase = await createSupabaseServerClient();
  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    const errorMsg = error.message.toLowerCase();
    
    // Detect "user already registered" errors
    if (
      errorMsg.includes("already registered") ||
      errorMsg.includes("user already registered") ||
      errorMsg.includes("email address is already registered")
    ) {
      return {
        ok: false,
        error: "This email is already registered. Please sign in.",
        code: "USER_EXISTS",
      };
    }

    return {
      ok: false,
      error: error.message || "Failed to resend confirmation email. Please try again.",
      code: "UNKNOWN",
    };
  }

  return {
    ok: true,
    message: "Confirmation email sent.",
  };
}


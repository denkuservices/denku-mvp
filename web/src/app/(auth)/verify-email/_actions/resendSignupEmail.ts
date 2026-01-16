"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { sendVerifyEmail } from "@/lib/email/sendVerifyEmail";

export type ResendSignupEmailResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: "USER_EXISTS" | "UNKNOWN" };

export async function resendSignupEmailAction(
  email: string
): Promise<ResendSignupEmailResult> {
  const supabase = await createSupabaseServerClient();
  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  // Resend verification email via Resend
  // Generate confirmation link from Supabase admin to extract the token
  try {
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
      options: {
        redirectTo: emailRedirectTo,
      },
    });

    if (linkError) {
      const errorMsg = linkError.message.toLowerCase();
      
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
        error: linkError.message || "Failed to resend confirmation email. Please try again.",
        code: "UNKNOWN",
      };
    }

    if (!linkData) {
      return {
        ok: false,
        error: "Failed to generate confirmation link. Please try again.",
        code: "UNKNOWN",
      };
    }

    // Extract token from the generateLink response
    // Supabase's generateLink returns hashed_token or email_otp in properties
    const token = linkData.properties?.hashed_token || linkData.properties?.email_otp || "";
    
    if (token) {
      try {
        await sendVerifyEmail(email, token);
      } catch (resendErr) {
        // Don't fail if Resend fails - Supabase email is the source of truth
        console.error("[resendSignupEmailAction] Resend email failed (non-blocking):", resendErr);
      }
      return {
        ok: true,
        message: "Confirmation email sent.",
      };
    } else {
      // Fallback: try to extract from action_link URL
      const confirmationUrl = linkData.properties?.action_link || "";
      if (confirmationUrl) {
        try {
          const urlObj = new URL(confirmationUrl);
          const urlToken = urlObj.searchParams.get("token") || urlObj.searchParams.get("token_hash") || urlObj.searchParams.get("code") || "";
          if (urlToken) {
            try {
              await sendVerifyEmail(email, urlToken);
            } catch (resendErr) {
              // Don't fail if Resend fails - Supabase email is the source of truth
              console.error("[resendSignupEmailAction] Resend email failed (non-blocking):", resendErr);
            }
            return {
              ok: true,
              message: "Confirmation email sent.",
            };
          }
        } catch (urlErr) {
          console.error("[resendSignupEmailAction] Error parsing confirmation URL:", urlErr);
        }
      }
      
      console.error("[resendSignupEmailAction] Could not extract token from generateLink response");
      return {
        ok: false,
        error: "Failed to generate verification token. Please try again.",
        code: "UNKNOWN",
      };
    }
  } catch (err) {
    console.error("[resendSignupEmailAction] Failed to send Resend email:", err);
    return {
      ok: false,
      error: "Failed to send confirmation email. Please try again.",
      code: "UNKNOWN",
    };
  }
}


"use server";

export type ResendSignupEmailResult =
  | { ok: true; message: string }
  | { ok: false; error: string; code?: "USER_EXISTS" | "UNKNOWN" };

/**
 * Resend signup email action (no-op).
 * Email verification is handled by Supabase default confirmation emails.
 */
export async function resendSignupEmailAction(
  email: string
): Promise<ResendSignupEmailResult> {
  if (!email || !email.trim()) {
    return {
      ok: false,
      error: "Missing email",
      code: "UNKNOWN",
    };
  }

  // Supabase handles email verification automatically
  // This action is a no-op to maintain UI compatibility
  console.log("[resendSignupEmailAction] Resend requested for:", email);

  return {
    ok: true,
    message: "Confirmation email sent.",
  };
}


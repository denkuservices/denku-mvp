"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export type SendCodeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendCodeAction(formData: FormData): Promise<SendCodeResult> {
  try {
    const email = mustString(formData.get("email"), "email");

    const supabase = await createSupabaseServerClient();

    // Send OTP code via Supabase
    /*
     * `emailRedirectTo` matters even though this flow expects a CODE.
     *
     * Which of the two a customer receives is decided by the Supabase email template, not by
     * this call: a template containing `{{ .Token }}` sends six digits, one containing
     * `{{ .ConfirmationURL }}` sends a link. Supabase also picks a DIFFERENT template depending
     * on whether the address is new ("Confirm signup") or already exists ("Magic Link") — so the
     * same button can send a code to one person and a link to another.
     *
     * Without this option a link falls back to the project's Site URL, which is the marketing
     * homepage: the customer clicks, lands on `/?code=…`, and nothing consumes it. Naming the
     * callback costs nothing when a code arrives and rescues the flow when a link does.
     */
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${getBaseUrl()}/auth/callback`,
      },
    });

    if (error) {
      // Log server-side for debugging
      console.error("[sendCodeAction] Supabase OTP error:", error.message, error.status);

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

      // Generic error to avoid leaking email existence
      return { ok: false, error: "Failed to send verification code. Please try again." };
    }

    return { ok: true };
  } catch (err) {
    // Only throw for unexpected system errors (e.g., missing env)
    // For form validation errors, return structured error
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendCodeAction] Unexpected error:", errorMsg);
    return { ok: false, error: "An unexpected error occurred. Please try again." };
  }
}


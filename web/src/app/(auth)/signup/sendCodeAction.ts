"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";
import { emailAlreadyRegistered } from "@/lib/auth/emailAlreadyRegistered";
import { resolveRequestEmailLocale } from "@/lib/email/locale.server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export type SendCodeResult =
  | { ok: true }
  /**
   * A finished account already exists — and NOTHING was sent.
   *
   * Carries no `error` string on purpose: this is not a failure and must not be rendered in the
   * red error box beside "please enter a valid email". The wording belongs to the page, which
   * knows the reader's language; the action only reports what is true.
   */
  | { ok: false; code: "ALREADY_REGISTERED" }
  | { ok: false; code: "ERROR"; error: string };

export async function sendCodeAction(formData: FormData): Promise<SendCodeResult> {
  try {
    const email = mustString(formData.get("email"), "email");

    /*
     * Ask before sending, and send nothing to an account that already exists.
     *
     * Supabase decides which email template to use from whether the address is known — the same
     * button below mails a code to a new address and a one-click MAGIC LINK to an existing one.
     * A customer who typed their own address into the signup form was therefore emailed a link
     * that signed them straight into their dashboard. The account was never the problem; being
     * told nothing about it was.
     *
     * `unknown` proceeds. The lookup is a service-role read against the same database the OTP
     * call is about to use, so the only way it fails is an outage that would stop the send too —
     * and refusing on it would mean a database blip blocking every new customer from signing up.
     */
    if ((await emailAlreadyRegistered(email)) === "registered") {
      console.info("[sendCodeAction] refused: address already registered, nothing sent");
      return { ok: false, code: "ALREADY_REGISTERED" };
    }

    const supabase = await createSupabaseServerClient();
    const locale = await resolveRequestEmailLocale();

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
        data: { ui_locale: locale },
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
        return { ok: false, code: "ERROR", error: "Too many requests. Please wait a moment and try again." };
      }

      if (
        errorMsg.includes("invalid") ||
        errorMsg.includes("email") ||
        error.status === 400
      ) {
        return { ok: false, code: "ERROR", error: "Please enter a valid email address." };
      }

      return { ok: false, code: "ERROR", error: "Failed to send verification code. Please try again." };
    }

    return { ok: true };
  } catch (err) {
    // Only throw for unexpected system errors (e.g., missing env)
    // For form validation errors, return structured error
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendCodeAction] Unexpected error:", errorMsg);
    return { ok: false, code: "ERROR", error: "An unexpected error occurred. Please try again." };
  }
}


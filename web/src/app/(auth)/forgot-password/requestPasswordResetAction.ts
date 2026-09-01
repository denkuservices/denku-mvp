"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

export type RequestPasswordResetResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Kick off a password reset via Supabase's built-in recovery email.
 *
 * Design (R-011):
 * - Uses Supabase Auth's default (link-based) recovery email — consistent with the
 *   existing "Supabase emails are the source of truth" auth architecture (signup
 *   verification works the same way), rather than the repo's separate custom
 *   `sendPasswordResetEmail` path.
 * - `redirectTo` points at a dedicated `/auth/reset-callback` route handler that
 *   exchanges the recovery code for a session and forwards to `/reset-password`.
 *   Kept separate from the shared signup `/auth/callback` to avoid any regression
 *   risk to the signup critical path.
 *
 * ENUMERATION-SAFE: always returns `{ ok: true }` for a well-formed email regardless
 * of whether an account exists.
 *
 * **This is deliberately NOT the product-wide rule, and the asymmetry is the point.** Signup
 * tells a customer outright that their address is already registered — because it must: Supabase
 * mails a magic LINK to a known address, and a customer who was silently signed into a dashboard
 * they did not expect had no way to understand what had happened.
 *
 * Reset stays silent because the two are not the same request. On signup a person is claiming
 * *this address is mine*; being wrong costs them a wasted form submission. Here a person is
 * asking us to *send a credential to an address*, which is the request an attacker uses to probe
 * at scale and the one where knowing the answer pairs with something worth having. Same
 * information, different price for leaking it — so the two surfaces answer differently on
 * purpose. Do not "make these consistent" by opening this one.
 *
 * OPERATOR NOTE: `${baseUrl}/auth/reset-callback` must be present in the Supabase
 * Auth "Redirect URLs" allowlist (same place `/auth/callback` is configured) or
 * Supabase falls back to the Site URL and the link won't reach the reset form.
 */
export async function requestPasswordResetAction(
  formData: FormData
): Promise<RequestPasswordResetResult> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  // Minimal shape validation — do NOT reveal whether the account exists.
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const redirectTo = `${getBaseUrl()}/auth/reset-callback`;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      // Log server-side only; never surface provider detail or account existence.
      console.error("[requestPasswordReset] Supabase error:", error.message);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[requestPasswordReset] Unexpected error:", message);
  }

  // Always succeed to the caller (enumeration-safe).
  return { ok: true };
}

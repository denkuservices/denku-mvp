/**
 * Auth email templates (verification, one-time code, password reset).
 *
 * These render through the shared `renderEmail()` chrome — the first mails a customer
 * ever receives are the ones most likely to decide whether the product looks real, and
 * they used to be the least brand-carrying thing we sent (an indigo `#4f46e5` button on
 * a white box that could have come from any starter template).
 *
 * NOTE ON WHAT ACTUALLY SENDS: Supabase Auth owns the live signup-confirmation, OTP and
 * password-recovery mails (`signInWithOtp` / `resetPasswordForEmail`), and Supabase
 * renders those from templates stored in its own dashboard, not from this file. The
 * matching HTML lives in `docs/email/supabase-auth/` and has to be pasted there by an
 * operator. These functions cover the Resend-side paths and keep one source of copy.
 *
 * Sender addresses are centralized in `./senders` (R-080) — resolved per stream at send
 * time, not hardcoded here.
 */

import { getBaseUrl } from "@/lib/utils/url";
import { renderEmail, codeBlock, linkFallback, notice } from "./layout";

/**
 * Canonical site URL, resolved per render.
 *
 * This was frozen to `https://denku-mvp.vercel.app`, so verification and password-reset emails
 * sent customers to the Vercel build host rather than denku.io. Same defect class as R-077: a
 * non-canonical URL baked into a customer-facing path. Now follows `NEXT_PUBLIC_SITE_URL`.
 */
const baseUrl = () => getBaseUrl().replace(/\/+$/, "");

export interface VerificationEmailParams {
  email: string;
  token: string;
  redirectTo?: string;
}

export interface PasswordResetEmailParams {
  email: string;
  token: string;
}

/**
 * Email verification template for signup
 * Uses Supabase's email confirmation flow via callback URL
 */
export function getVerificationEmailHtml({ email, token, redirectTo }: VerificationEmailParams): string {
  // For Supabase email confirmation, the redirectTo is the callback URL
  // Supabase will automatically append the confirmation token when the user clicks
  // If we have a token, use it directly; otherwise use the callback URL
  const verifyUrl = token
    ? `${baseUrl()}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
    : redirectTo
    ? redirectTo // Supabase callback URL - Supabase will add the token
    : `${baseUrl()}/verify-email?email=${encodeURIComponent(email)}`;

  return renderEmail({
    title: "Verify your email — Denku",
    preheader: "One click and your Denku workspace is ready to set up.",
    eyebrow: "Confirm your account",
    heading: "Verify your email address",
    intro:
      "Welcome to Denku. Confirm this address and we'll take you straight to setting up the AI that answers for your business.",
    cta: { label: "Verify email", url: verifyUrl },
    postCta: [linkFallback(verifyUrl)],
    reason:
      "You're receiving this because this address was used to create a Denku account. If that wasn't you, ignore this email — nothing is activated until it's verified.",
  });
}

/**
 * OTP code email template (for resend verification code)
 */
export function getOtpEmailHtml({ token }: VerificationEmailParams): string {
  return renderEmail({
    title: "Your verification code — Denku",
    preheader: `Your Denku verification code is ${token}. It expires in 1 hour.`,
    eyebrow: "Verification code",
    heading: "Your sign-in code",
    intro: "Enter this code to confirm your email address:",
    blocks: [
      codeBlock(token),
      notice("This code expires in **1 hour** and can be used once.", "neutral"),
    ],
    reason:
      "You're receiving this because someone requested a verification code for this address on Denku. If it wasn't you, no action is needed — the code alone gives no access to an existing account.",
  });
}

/**
 * Password reset email template
 */
export function getPasswordResetEmailHtml({ email, token }: PasswordResetEmailParams): string {
  const resetUrl = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return renderEmail({
    title: "Reset your password — Denku",
    preheader: "Choose a new password for your Denku account. The link expires in 1 hour.",
    eyebrow: "Account security",
    heading: "Reset your password",
    intro: "We received a request to reset the password for your Denku account.",
    cta: { label: "Choose a new password", url: resetUrl },
    postCta: [linkFallback(resetUrl)],
    signoff:
      "This link expires in **1 hour**. If you didn't ask for it, you can ignore this email — your current password stays active.",
    reason:
      "You're receiving this because a password reset was requested for this address. This is a security email, not marketing.",
  });
}

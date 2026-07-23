"use server";

import { resend } from "./resend";
import { resolveSender } from "./senders";
import { getVerificationEmailHtml, getOtpEmailHtml, getPasswordResetEmailHtml } from "./templates";
import type { VerificationEmailParams, PasswordResetEmailParams } from "./templates";
import { welcomeTemplate } from "./templates/welcome";

/**
 * Send email verification email after signup
 */
export async function sendVerificationEmail(params: VerificationEmailParams & { redirectTo?: string }) {
  // Skip if Resend is not configured (domainless beta)
  if (!resend) {
    console.log("[sendVerificationEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resolveSender("auth"),
      to: params.email,
      subject: "Verify your email - Denku",
      html: getVerificationEmailHtml(params),
    });

    if (error) {
      console.error("[sendVerificationEmail] Resend error:", error);
      // Don't throw - allow Supabase emails to be the source of truth
      return { ok: true, skipped: true, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendVerificationEmail] Exception:", err);
    // Don't throw - allow Supabase emails to be the source of truth
    return { ok: true, skipped: true, error: err };
  }
}

/**
 * Send OTP code email (for resend verification)
 */
export async function sendOtpEmail(params: VerificationEmailParams) {
  // Skip if Resend is not configured (domainless beta)
  if (!resend) {
    console.log("[sendOtpEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resolveSender("auth"),
      to: params.email,
      subject: "Your verification code - Denku",
      html: getOtpEmailHtml(params),
    });

    if (error) {
      console.error("[sendOtpEmail] Resend error:", error);
      // Don't throw - allow Supabase emails to be the source of truth
      return { ok: true, skipped: true, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendOtpEmail] Exception:", err);
    // Don't throw - allow Supabase emails to be the source of truth
    return { ok: true, skipped: true, error: err };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(params: PasswordResetEmailParams) {
  // Skip if Resend is not configured (domainless beta)
  if (!resend) {
    console.log("[sendPasswordResetEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: true, skipped: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: resolveSender("auth"),
      to: params.email,
      subject: "Reset your password - Denku",
      html: getPasswordResetEmailHtml(params),
    });

    if (error) {
      console.error("[sendPasswordResetEmail] Resend error:", error);
      // Don't throw - allow Supabase emails to be the source of truth
      return { ok: true, skipped: true, error };
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendPasswordResetEmail] Exception:", err);
    // Don't throw - allow Supabase emails to be the source of truth
    return { ok: true, skipped: true, error: err };
  }
}

/**
 * Send an artifact notification email (R-008) from the verified `denku.io` sender.
 * Returns a structured result; never throws. Idempotency + recipient resolution are
 * the caller's responsibility (see `lib/notifications/artifactNotifications.ts`).
 */
export async function sendArtifactNotificationEmail(
  toEmail: string,
  email: { subject: string; html: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.log("[sendArtifactNotificationEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: resolveSender("notify"),
      to: toEmail,
      subject: email.subject,
      html: email.html,
    });

    if (error) {
      console.error("[sendArtifactNotificationEmail] Resend error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendArtifactNotificationEmail] Exception:", message);
    return { ok: false, error: message };
  }
}

/**
 * Send a billing/service alert email (R-009) from the verified `denku.io` sender.
 * Returns a structured result; never throws. Recipient + idempotency are the
 * caller's responsibility.
 */
export async function sendBillingNotificationEmail(
  toEmail: string,
  email: { subject: string; html: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.log("[sendBillingNotificationEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { error } = await resend.emails.send({
      from: resolveSender("notify"),
      to: toEmail,
      subject: email.subject,
      html: email.html,
    });

    if (error) {
      console.error("[sendBillingNotificationEmail] Resend error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendBillingNotificationEmail] Exception:", message);
    return { ok: false, error: message };
  }
}

/**
 * Send "Welcome to Denku" email (Resend). Server-only.
 * Called once when onboarding starts after verified login.
 */
export async function sendWelcomeEmail(toEmail: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.log("[sendWelcomeEmail] Skipped - RESEND_API_KEY not configured");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const { subject, html } = welcomeTemplate();

  try {
    const { data, error } = await resend.emails.send({
      from: resolveSender("welcome"),
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      console.error("[sendWelcomeEmail] Resend error:", error);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[sendWelcomeEmail] Exception:", message);
    return { ok: false, error: message };
  }
}

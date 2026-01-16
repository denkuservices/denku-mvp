"use server";

import { resend, SENDER } from "./resend";
import { getVerificationEmailHtml, getOtpEmailHtml, getPasswordResetEmailHtml } from "./templates";
import type { VerificationEmailParams, PasswordResetEmailParams } from "./templates";

/**
 * Send email verification email after signup
 */
export async function sendVerificationEmail(params: VerificationEmailParams & { redirectTo?: string }) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER,
      to: params.email,
      subject: "Verify your email - Denku AI",
      html: getVerificationEmailHtml(params),
    });

    if (error) {
      console.error("[sendVerificationEmail] Resend error:", error);
      throw new Error("Failed to send verification email");
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendVerificationEmail] Exception:", err);
    throw err;
  }
}

/**
 * Send OTP code email (for resend verification)
 */
export async function sendOtpEmail(params: VerificationEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER,
      to: params.email,
      subject: "Your verification code - Denku AI",
      html: getOtpEmailHtml(params),
    });

    if (error) {
      console.error("[sendOtpEmail] Resend error:", error);
      throw new Error("Failed to send verification code");
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendOtpEmail] Exception:", err);
    throw err;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(params: PasswordResetEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER,
      to: params.email,
      subject: "Reset your password - Denku AI",
      html: getPasswordResetEmailHtml(params),
    });

    if (error) {
      console.error("[sendPasswordResetEmail] Resend error:", error);
      throw new Error("Failed to send password reset email");
    }

    return { ok: true, data };
  } catch (err) {
    console.error("[sendPasswordResetEmail] Exception:", err);
    throw err;
  }
}

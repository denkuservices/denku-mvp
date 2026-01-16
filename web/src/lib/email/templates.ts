/**
 * Email templates for Denku AI auth flow
 * All emails use sender: "Denku AI <onboarding@resend.dev>"
 */

const BASE_URL = "https://denku-mvp.vercel.app";
const SENDER = "Denku AI <onboarding@resend.dev>";

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
    ? `${BASE_URL}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
    : redirectTo
    ? redirectTo // Supabase callback URL - Supabase will add the token
    : `${BASE_URL}/verify-email?email=${encodeURIComponent(email)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email - Denku AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1e293b; margin-top: 0; font-size: 24px;">Verify your email</h1>
    <p style="color: #64748b; font-size: 16px;">Thanks for signing up for Denku AI! Please verify your email address to get started.</p>
    
    <div style="margin: 30px 0;">
      <a href="${verifyUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Verify Email</a>
    </div>
    
    <p style="color: #64748b; font-size: 14px; margin-top: 30px;">Or copy and paste this link into your browser:</p>
    <p style="color: #4f46e5; font-size: 12px; word-break: break-all; background: #f1f5f9; padding: 12px; border-radius: 4px;">${verifyUrl}</p>
    
    <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      If you didn't create an account with Denku AI, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * OTP code email template (for resend verification code)
 */
export function getOtpEmailHtml({ email, token }: VerificationEmailParams): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your verification code - Denku AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1e293b; margin-top: 0; font-size: 24px;">Your verification code</h1>
    <p style="color: #64748b; font-size: 16px;">Use this code to verify your email address:</p>
    
    <div style="margin: 30px 0; text-align: center;">
      <div style="display: inline-block; background: #f1f5f9; border: 2px solid #4f46e5; border-radius: 8px; padding: 20px 40px;">
        <div style="font-size: 32px; font-weight: 700; color: #4f46e5; letter-spacing: 4px; font-family: monospace;">${token}</div>
      </div>
    </div>
    
    <p style="color: #64748b; font-size: 14px;">This code will expire in 1 hour.</p>
    
    <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      If you didn't request this code, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Password reset email template
 */
export function getPasswordResetEmailHtml({ email, token }: PasswordResetEmailParams): string {
  const resetUrl = `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password - Denku AI</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <h1 style="color: #1e293b; margin-top: 0; font-size: 24px;">Reset your password</h1>
    <p style="color: #64748b; font-size: 16px;">We received a request to reset your password for your Denku AI account.</p>
    
    <div style="margin: 30px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">Reset Password</a>
    </div>
    
    <p style="color: #64748b; font-size: 14px; margin-top: 30px;">Or copy and paste this link into your browser:</p>
    <p style="color: #4f46e5; font-size: 12px; word-break: break-all; background: #f1f5f9; padding: 12px; border-radius: 4px;">${resetUrl}</p>
    
    <p style="color: #94a3b8; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export { BASE_URL, SENDER };

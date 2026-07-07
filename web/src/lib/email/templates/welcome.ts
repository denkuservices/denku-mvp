/**
 * Welcome email template (Resend). Sent once when onboarding starts after verified login.
 * Premium design; CTA links to /onboarding. NOT used for Supabase Auth emails.
 */

export function welcomeTemplate(): { subject: string; html: string } {
  const subject = "Welcome to Denku 🎉";
  const onboardingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://denku.io"}/onboarding`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Denku</title>
</head>
<body style="margin: 0; padding: 0;">
<div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb; padding: 60px 20px; text-align: center;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 48px 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border: 1px solid #f1f5f9;">
    
    <div style="margin-bottom: 32px;">
      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #000000 0%, #333333 100%); border-radius: 14px; margin: 0 auto; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <span style="color: white; font-weight: 700; font-size: 24px;">D</span>
      </div>
    </div>

    <h1 style="font-size: 28px; font-weight: 700; color: #0f172a; margin: 0 0 16px 0; letter-spacing: -0.025em;">
      Welcome to the family!
    </h1>
    
    <p style="font-size: 16px; line-height: 1.6; color: #64748b; margin-bottom: 32px;">
      We're thrilled to have you here. Your account is verified and ready to go. Let's set up your profile and get you started.
    </p>

    <div style="margin-bottom: 40px;">
      <a href="${onboardingUrl}" style="background-color: #0f172a; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        Start Onboarding
      </a>
    </div>

    <div style="background-color: #f8fafc; border-radius: 20px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 32px; text-align: left;">
      <div style="margin-bottom: 16px;">
        <span style="font-size: 18px; margin-right: 8px;">🚀</span>
        <span style="font-size: 14px; color: #334155; font-weight: 600;">Fast Setup</span>
        <p style="font-size: 13px; color: #64748b; margin: 4px 0 0 30px;">Complete your profile in less than 2 minutes.</p>
      </div>
      <div>
        <span style="font-size: 18px; margin-right: 8px;">🛡️</span>
        <span style="font-size: 14px; color: #334155; font-weight: 600;">Secure & Private</span>
        <p style="font-size: 13px; color: #64748b; margin: 4px 0 0 30px;">Your data is protected with industry standards.</p>
      </div>
    </div>

    <p style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
      Need help? Just reply to this email or visit our Help Center.
    </p>

    <div style="margin-top: 48px; padding-top: 32px; border-top: 1px solid #f1f5f9;">
      <p style="font-size: 12px; color: #cbd5e1; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;">
        Denku
      </p>
    </div>
  </div>
</div>
</body>
</html>
`.trim();

  return { subject, html };
}

import { resend, SENDER } from "./resend";

const APP_URL = "https://denku-mvp.vercel.app";

export async function sendVerifyEmail(email: string, token: string) {
  // Skip if Resend is not configured (domainless beta)
  if (!resend) {
    console.log("[Resend] sendVerifyEmail skipped - RESEND_API_KEY not configured");
    return { skipped: true };
  }

  // In non-production, Resend is in testing mode and can only send to denkuservices@gmail.com
  if (process.env.NODE_ENV !== "production") {
    const allowedEmail = "denkuservices@gmail.com";
    if (email.toLowerCase() !== allowedEmail.toLowerCase()) {
      // Skip sending silently to avoid breaking UX
      return { skipped: true };
    }
  }

  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;

  console.log("[Resend] sendVerifyEmail ->", { email, verifyUrl });

  try {
    const result = await resend.emails.send({
      from: SENDER,
      to: email,
      subject: "Verify your email – Denku AI",
      html: `
        <h2>Verify your email</h2>
        <p>Welcome to Denku AI.</p>
        <p>Please confirm your email to activate your workspace.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 18px;
                  background:#4f46e5;color:white;
                  border-radius:8px;text-decoration:none">
          Verify email
        </a>
        <p style="margin-top:24px;font-size:12px;color:#666">
          If you didn't create this account, you can safely ignore this email.
        </p>
      `,
    });

    console.log("[Resend] sendVerifyEmail OK ->", result);
    return result;
  } catch (err) {
    console.error("[Resend] sendVerifyEmail FAILED ->", err);
    // Don't throw - allow Supabase emails to be the source of truth
    return { skipped: true, error: err };
  }
}

import { resend } from "./resend";
import { resolveSender } from "./senders";
import { getBaseUrl } from "@/lib/utils/url";

/**
 * Verification links must point at the canonical site, not a build host.
 *
 * This was frozen to `https://denku-mvp.vercel.app`, so every verification email a real customer
 * received linked them to the Vercel deployment URL instead of denku.io — the same class of defect
 * as R-077 (a non-canonical URL baked into a customer-facing path). Resolved per send from
 * `NEXT_PUBLIC_SITE_URL`, so the address follows the deployment.
 */
const appUrl = () => getBaseUrl().replace(/\/+$/, "");

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

  const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;

  console.log("[Resend] sendVerifyEmail ->", { email, verifyUrl });

  try {
    const result = await resend.emails.send({
      from: resolveSender("auth"),
      to: email,
      subject: "Verify your email – Denku",
      html: `
        <h2>Verify your email</h2>
        <p>Welcome to Denku.</p>
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

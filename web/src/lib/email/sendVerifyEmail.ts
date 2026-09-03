import { resend } from "./resend";
import { brandAttachments } from "./inlineLogo";
import { resolveSender } from "./senders";
import { getBaseUrl } from "@/lib/utils/url";
import { getVerificationEmailHtml } from "./templates";

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

  // Mirrors the link the template builds, so the log and the inbox agree.
  const verifyUrl = `${appUrl()}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;

  console.log("[Resend] sendVerifyEmail ->", { email, verifyUrl });

  try {
    const result = await resend.emails.send({
      from: resolveSender("auth"),
      to: email,
      subject: "Verify your email – Denku",
      html: getVerificationEmailHtml({ email, token }),
      // The masthead mark, carried inside the message rather than fetched from denku.io. This is
      // the first email a customer ever gets from us, and it is the one most likely to be opened
      // in a client that blocks images from a sender it has never seen. See lib/email/inlineLogo.ts.
      attachments: await brandAttachments(),
    });

    console.log("[Resend] sendVerifyEmail OK ->", result);
    return result;
  } catch (err) {
    console.error("[Resend] sendVerifyEmail FAILED ->", err);
    // Don't throw - allow Supabase emails to be the source of truth
    return { skipped: true, error: err };
  }
}

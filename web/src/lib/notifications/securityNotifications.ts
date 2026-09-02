import "server-only";

import { getBaseUrl } from "@/lib/utils/url";
import { sendOnce } from "@/lib/email/dispatch";
import { passwordChangedTemplate } from "@/lib/email/templates/passwordChanged";
import { resolveUserEmailLocale } from "@/lib/email/locale.server";

/**
 * Security notifications — currently the password-change confirmation.
 *
 * Unflagged, and deliberately so: this is the mail that tells someone their account was
 * taken over. Staging it behind an env switch would mean the one email whose whole value
 * is arriving unbidden is the one that might silently not arrive.
 *
 * Deduped per user per minute, which is the honest shape of the risk here: there is no
 * webhook to redeliver, only a double-submitted form, while a customer changing their
 * password twice in a day must get two emails.
 *
 * NEVER THROWS — a failed email must not fail a password change the user already made.
 */
export async function notifyPasswordChanged(params: {
  userId: string;
  email: string;
  orgName?: string | null;
  /** Coarse client hint (browser/OS). Never a raw user-agent or an IP address. */
  device?: string | null;
}): Promise<void> {
  try {
    const { userId, email, orgName, device } = params;
    if (!email) return;

    const changedAt = new Date();
    const minuteBucket = changedAt.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm

    const { subject, html } = passwordChangedTemplate({
      changedAt,
      device: device ?? null,
      orgName: orgName ?? null,
      recoveryUrl: `${getBaseUrl()}/forgot-password`,
      locale: await resolveUserEmailLocale(userId),
    });

    await sendOnce({
      kind: "password_changed",
      dedupeKey: `${userId}:${minuteBucket}`,
      to: email,
      subject,
      html,
      sender: "auth",
    });
  } catch (err) {
    console.error("[SECURITY][NOTIFY] notifyPasswordChanged failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

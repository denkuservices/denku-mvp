/**
 * Password-changed confirmation — the security email every account system is expected
 * to send and Denku did not.
 *
 * Its value is entirely in the negative case: the person who did change their password
 * learns nothing, and the person whose account was taken over learns everything. That is
 * why it goes out on every successful change, why it names when and (roughly) from
 * where, and why the recovery path is one click and not a support queue.
 *
 * It deliberately carries no reset link of its own — a "reset your password" link in a
 * mail triggered by a password change is a phishing pattern, so it points at the normal
 * account-recovery page instead.
 */

import { renderEmail, detailList, notice } from "../layout";
import { formatDateLong } from "../brand";

export interface PasswordChangedParams {
  /** When the change happened. */
  changedAt: string | Date;
  /** Coarse client hint (browser/OS), never a full user-agent or an IP. */
  device?: string | null;
  orgName?: string | null;
  /** Where to start recovery if this wasn't them. */
  recoveryUrl: string;
}

export function passwordChangedTemplate(params: PasswordChangedParams): {
  subject: string;
  html: string;
} {
  const { changedAt, device, orgName, recoveryUrl } = params;

  const subject = "Your Denku password was changed";

  const html = renderEmail({
    title: subject,
    preheader: "If this was you, nothing to do. If it wasn't, secure your account now.",
    eyebrow: "Account security",
    heading: "Your password was changed",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    intro:
      "The password on your Denku account was just changed. If that was you, you're all set — no action needed.",
    blocks: [
      detailList([
        { label: "When", value: formatDateLong(changedAt) },
        ...(device ? [{ label: "Device", value: device }] : []),
      ]),
      notice(
        "**If this wasn't you**, reset your password immediately and check who has access to your workspace.",
        "critical"
      ),
    ],
    cta: { label: "Secure my account", url: recoveryUrl },
    reason:
      "You're receiving this because your Denku password changed. We send this on every password change and can't turn it off — it's how you'd find out about an account takeover.",
  });

  return { subject, html };
}

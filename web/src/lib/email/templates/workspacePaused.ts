/**
 * Workspace-paused alert email (R-009) — sent to the owner when billing pauses the
 * workspace (hard_cap or past_due), so a business phone never goes dead silently.
 * Pure; caller resolves recipient + sends.
 *
 * This is the most consequential mail Denku sends: while it sits unread, the customer's
 * calls are going unanswered. So it says what stopped, why, and the single thing that
 * restarts it — and nothing else.
 */

import { renderEmail, notice, steps } from "../layout";

export type PauseReason = "hard_cap" | "past_due";

export function workspacePausedTemplate(params: {
  reason: PauseReason;
  orgName?: string | null;
  billingUrl: string;
}): { subject: string; html: string } {
  const { reason, orgName, billingUrl } = params;

  const isHardCap = reason === "hard_cap";
  const subject = isHardCap
    ? "Your Denku AI line is paused — usage cap reached"
    : "Your Denku AI line is paused — payment needed";

  const reasonLine = isHardCap
    ? "You've used all of your plan's included minutes this month, so we paused the line rather than let overage charges build up unannounced."
    : "A recent payment didn't go through, so we paused the line while the account is past due.";

  const action = isHardCap
    ? "Upgrade your plan or raise your usage limit to start answering again."
    : "Update your payment method to start answering again.";

  const html = renderEmail({
    title: subject,
    preheader: isHardCap
      ? "Your included minutes are used up and your AI is not answering calls right now."
      : "A payment failed and your AI is not answering calls right now.",
    eyebrow: "Service paused",
    heading: "Your AI line has been paused",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "critical",
    intro: reasonLine,
    blocks: [
      notice(
        "**Your AI is not answering calls right now.** Callers hear your carrier's unavailable message until the line resumes.",
        "critical"
      ),
      steps(
        isHardCap
          ? [
              "Open billing and upgrade your plan, or raise the usage limit.",
              "The line resumes automatically — usually within a minute.",
            ]
          : [
              "Open billing and update your payment method.",
              "Once the payment clears, the line resumes automatically.",
            ],
        "critical"
      ),
    ],
    cta: { label: "Manage billing", url: billingUrl },
    signoff: action,
    reason:
      "You're receiving this because your Denku phone line was paused. This is a service alert, not marketing.",
  });

  return { subject, html };
}

/**
 * "Your line is answering again" — the close of the loop that `workspacePaused` opens.
 *
 * A pause email with no matching resume leaves the customer permanently unsure whether
 * their phone works, which is the worst state to leave a business in. This is short on
 * purpose: the only fact that matters is that calls are being answered again.
 */

import { renderEmail, notice } from "../layout";

export type ResumeReason = "payment_received" | "plan_upgraded" | "manual";

export function workspaceResumedTemplate(params: {
  reason?: ResumeReason;
  orgName?: string | null;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const { reason = "payment_received", orgName, dashboardUrl } = params;

  const subject = "Your Denku AI line is answering again";

  const cause =
    reason === "plan_upgraded"
      ? "Your plan change went through, so we lifted the pause."
      : reason === "manual"
      ? "The pause on your workspace has been lifted."
      : "Your payment came through, so we lifted the pause.";

  const html = renderEmail({
    title: subject,
    preheader: "Your AI is back on the line and answering calls, 24/7.",
    eyebrow: "Service restored",
    heading: "Your AI is answering again",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "positive",
    intro: `${cause} Your number is bound to your AI again and calls are being answered right now.`,
    blocks: [
      notice(
        "Calls that came in while the line was paused were handled by your carrier, not by us, so they don't appear in your dashboard.",
        "neutral"
      ),
    ],
    cta: { label: "Open your dashboard", url: dashboardUrl },
    reason:
      "You're receiving this because your Denku workspace was paused and has now resumed. It's a service alert, not marketing.",
  });

  return { subject, html };
}

/**
 * Subscription-canceled / ending email.
 *
 * Two shapes, one template, because they are two genuinely different facts:
 *  - `scheduled`: cancelled but paid until the period end — the AI is still answering,
 *    and one click undoes it.
 *  - `ended`: the subscription is over — the number is released and calls stop.
 *
 * Being explicit that a released US number cannot be recovered is the honest thing to
 * put in front of someone at this moment; discovering it afterwards is how a cancellation
 * turns into a complaint.
 */

import { renderEmail, notice, detailList } from "../layout";
import { formatDateLong } from "../brand";

export interface SubscriptionCanceledParams {
  state: "scheduled" | "ended";
  planName?: string | null;
  /** When access ends (scheduled) or ended (ended). */
  effectiveAt?: string | Date | null;
  orgName?: string | null;
  billingUrl: string;
}

export function subscriptionCanceledTemplate(params: SubscriptionCanceledParams): {
  subject: string;
  html: string;
} {
  const { state, planName, effectiveAt, orgName, billingUrl } = params;
  const scheduled = state === "scheduled";
  const when = effectiveAt ? formatDateLong(effectiveAt) : null;

  const subject = scheduled
    ? "Your Denku subscription is set to end"
    : "Your Denku subscription has ended";

  const html = renderEmail({
    title: subject,
    preheader: scheduled
      ? `Your AI keeps answering${when ? ` until ${when}` : " until the end of your billing period"}. You can restart any time before then.`
      : "Your AI has stopped answering calls. Your data stays in your workspace.",
    eyebrow: "Subscription",
    heading: scheduled ? "Your subscription will end" : "Your subscription has ended",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: scheduled ? "warning" : "neutral",
    intro: scheduled
      ? "We've scheduled your cancellation. Nothing changes yet — your AI keeps answering until the end of the period you've already paid for."
      : "Your plan has ended and your AI has stopped answering. We're sorry to see you go.",
    blocks: [
      detailList([
        ...(planName ? [{ label: "Plan", value: planName }] : []),
        {
          label: scheduled ? "Ends" : "Ended",
          value: when ?? "End of the current billing period",
          strong: true,
        },
      ]),
      notice(
        scheduled
          ? "When the plan ends we release your US phone number back to the carrier. **A released number can't be recovered** — restart before then to keep it."
          : "Your calls, tickets and contacts stay in your workspace and you can export them any time. The phone number has been released back to the carrier.",
        scheduled ? "warning" : "neutral"
      ),
    ],
    cta: {
      label: scheduled ? "Keep my plan" : "Start a new plan",
      url: billingUrl,
    },
    signoff:
      "If something pushed you to this, reply and tell us — we read every one of these.",
    reason:
      "You're receiving this because your Denku subscription changed. It's a billing notice, not marketing.",
  });

  return { subject, html };
}

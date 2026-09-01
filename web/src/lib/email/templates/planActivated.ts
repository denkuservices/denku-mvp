/**
 * Plan-activated / order-confirmation email — sent when a Stripe checkout for a
 * subscription completes.
 *
 * Denku had no purchase confirmation at all: a customer paid $149–$899 and the only
 * acknowledgement was the app changing screens. Every subscription business sends this,
 * and for good reason — it is the receipt people search for months later when they want
 * to know what they signed up for, and its absence is what makes a young SaaS feel
 * unfinished at exactly the moment the customer has just trusted it with money.
 *
 * Deliberately NOT a tax invoice: Stripe issues those, and this links to it rather than
 * restating amounts we might get wrong. What it does own is the plan's terms in plain
 * language — what's included, what happens past the included minutes.
 */

import { renderEmail, detailList, notice } from "../layout";
import { formatUsd } from "../brand";

export interface PlanActivatedParams {
  planName: string;
  monthlyFeeUsd: number;
  includedMinutes: number;
  includedPhoneNumbers: number;
  concurrencyLimit: number;
  overageRateUsdPerMin: number;
  orgName?: string | null;
  /** Stripe's hosted invoice/receipt, when the webhook gave us one. */
  invoiceUrl?: string | null;
  /** Where to continue — onboarding while activating, the dashboard once live. */
  ctaUrl: string;
  ctaLabel?: string;
}

export function planActivatedTemplate(params: PlanActivatedParams): {
  subject: string;
  html: string;
} {
  const {
    planName,
    monthlyFeeUsd,
    includedMinutes,
    includedPhoneNumbers,
    concurrencyLimit,
    overageRateUsdPerMin,
    orgName,
    invoiceUrl,
    ctaUrl,
    ctaLabel = "Continue setup",
  } = params;

  const subject = `Your ${planName} plan is active`;

  const html = renderEmail({
    title: subject,
    preheader: `${planName} · ${formatUsd(monthlyFeeUsd)}/month · ${includedMinutes.toLocaleString()} minutes included.`,
    eyebrow: "Subscription confirmed",
    heading: `Your ${planName} plan is active`,
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "positive",
    intro:
      "Thank you — your subscription is live. Here's exactly what it includes, so there are no surprises later.",
    blocks: [
      detailList([
        { label: "Plan", value: planName, strong: true },
        { label: "Price", value: `${formatUsd(monthlyFeeUsd)} / month`, strong: true },
        { label: "Included minutes", value: `${includedMinutes.toLocaleString()} per month` },
        {
          label: "Phone numbers",
          value: `${includedPhoneNumbers} included`,
        },
        {
          label: "Simultaneous calls",
          value: `${concurrencyLimit} at once`,
        },
        {
          label: "Beyond included",
          value: `${formatUsd(overageRateUsdPerMin)} / minute`,
        },
      ]),
      notice(
        `We pause your line at 100% of the included minutes instead of letting overage build up quietly — and we warn you at 50%, 75% and 90% first.`,
        "neutral"
      ),
    ],
    cta: { label: ctaLabel, url: ctaUrl },
    ...(invoiceUrl ? { secondary: { label: "View your receipt", url: invoiceUrl } } : {}),
    signoff: "You can change or cancel your plan at any time from billing settings.",
    reason:
      "You're receiving this because a subscription was purchased for your Denku workspace. It's a billing confirmation, not marketing.",
  });

  return { subject, html };
}

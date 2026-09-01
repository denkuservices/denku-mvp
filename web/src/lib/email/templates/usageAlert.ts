/**
 * Usage-threshold alert email (R-009) — "you've used X% of your included minutes",
 * sent as an org crosses 50/75/90% so the 100% pause is never a surprise. Pure.
 *
 * The number is the message, so it is set as a figure with a meter beneath it: a reader
 * glancing at this on a phone should learn where they stand without reading a sentence.
 */

import { renderEmail, figure, meter, detailList, type EmailTone } from "../layout";

export function usageAlertTemplate(params: {
  thresholdPct: number;
  billableMinutes: number;
  includedMinutes: number;
  orgName?: string | null;
  billingUrl: string;
}): { subject: string; html: string } {
  const { thresholdPct, billableMinutes, includedMinutes, orgName, billingUrl } = params;

  const subject = `You've used ${thresholdPct}% of your included minutes`;
  const remaining = Math.max(includedMinutes - billableMinutes, 0);
  // 90% is the last warning before the line pauses at 100%, so it gets the louder tone.
  const tone: EmailTone = thresholdPct >= 90 ? "warning" : "neutral";

  const html = renderEmail({
    title: subject,
    preheader: `${billableMinutes.toLocaleString()} of ${includedMinutes.toLocaleString()} included minutes used this month — about ${remaining.toLocaleString()} left.`,
    eyebrow: "Usage",
    heading: `You've used ${thresholdPct}% of this month's minutes`,
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone,
    blocks: [
      figure(`${thresholdPct}%`, "of your included minutes, used so far this month", tone),
      meter(thresholdPct, tone),
      detailList([
        { label: "Used", value: `${billableMinutes.toLocaleString()} min` },
        { label: "Included", value: `${includedMinutes.toLocaleString()} min` },
        { label: "Remaining", value: `${remaining.toLocaleString()} min`, strong: true },
      ]),
    ],
    intro:
      thresholdPct >= 90
        ? "Your AI is close to this month's included minutes. At 100% we pause the line rather than let overage charges build up quietly — so it's worth a look now."
        : "No action needed. This is a heads-up so you always know where your usage stands.",
    cta: { label: "View usage & billing", url: billingUrl },
    reason:
      "You're receiving this usage alert for your Denku workspace. It's a service email, not marketing.",
  });

  return { subject, html };
}

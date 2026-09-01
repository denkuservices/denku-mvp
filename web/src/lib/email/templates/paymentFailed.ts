/**
 * Payment-failed warning — sent when Stripe fails to collect an invoice.
 *
 * This is the mail that was missing between "everything is fine" and "your line is
 * paused". Card declines are overwhelmingly expired cards, not people refusing to pay,
 * so the honest version of this email is a heads-up with a deadline, not a threat: it
 * says what failed, what happens if nothing changes, and how long they have.
 *
 * The consequence line is the whole point — a business owner needs to know that an
 * unattended card means their phone stops being answered.
 */

import { renderEmail, detailList, notice } from "../layout";
import { formatUsdFromCents, formatDateLong } from "../brand";

export interface PaymentFailedParams {
  amountDueCents: number;
  /** Stripe's next automatic retry, when it told us one. */
  nextAttemptAt?: string | Date | null;
  invoiceNumber?: string | null;
  orgName?: string | null;
  /** Stripe's hosted invoice page — where the customer can pay directly. */
  invoiceUrl?: string | null;
  billingUrl: string;
}

export function paymentFailedTemplate(params: PaymentFailedParams): {
  subject: string;
  html: string;
} {
  const { amountDueCents, nextAttemptAt, invoiceNumber, orgName, invoiceUrl, billingUrl } =
    params;

  const amount = formatUsdFromCents(amountDueCents);
  const subject = "Payment failed — your Denku line is still answering, for now";

  const html = renderEmail({
    title: subject,
    preheader: `We couldn't collect ${amount}. Update your card to keep your AI answering calls.`,
    eyebrow: "Action needed",
    heading: "We couldn't take your payment",
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "warning",
    intro:
      "Your latest Denku payment didn't go through. In almost every case this is an expired or replaced card, and updating it takes a minute.",
    blocks: [
      detailList([
        { label: "Amount due", value: amount, strong: true },
        ...(invoiceNumber ? [{ label: "Invoice", value: invoiceNumber }] : []),
        ...(nextAttemptAt
          ? [{ label: "Next attempt", value: formatDateLong(nextAttemptAt) }]
          : []),
      ]),
      notice(
        "**Your AI is still answering.** If the payment keeps failing we pause the line, and callers stop reaching you — so it's worth sorting now.",
        "warning"
      ),
    ],
    cta: invoiceUrl
      ? { label: "Pay this invoice", url: invoiceUrl }
      : { label: "Update payment method", url: billingUrl },
    ...(invoiceUrl ? { secondary: { label: "Update your payment method", url: billingUrl } } : {}),
    signoff: "Already fixed it? Then ignore this — the next attempt will settle it.",
    reason:
      "You're receiving this because a payment on your Denku subscription failed. This is a service alert, not marketing.",
  });

  return { subject, html };
}

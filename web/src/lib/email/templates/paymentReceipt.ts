/**
 * Payment receipt — sent when a Stripe invoice is paid (the monthly renewal, and the
 * overage invoice when one is collected).
 *
 * The renewal charge is the moment a customer is most likely to wonder "what is this
 * line on my card?". A receipt that names the workspace and the period answers that
 * before it becomes a support ticket or a chargeback.
 *
 * Amounts come straight from Stripe's invoice (already in cents, already the truth) —
 * this template never computes money.
 */

import { renderEmail, detailList } from "../layout";
import { formatUsdFromCents, formatDateLong } from "../brand";

export interface PaymentReceiptParams {
  /** Stripe's human invoice number, e.g. `A1B2C3D4-0001`. */
  invoiceNumber?: string | null;
  amountPaidCents: number;
  /** ISO date or Date of payment. */
  paidAt: string | Date;
  description?: string | null;
  orgName?: string | null;
  /** Stripe's hosted invoice page (also carries the PDF). */
  invoiceUrl?: string | null;
  billingUrl: string;
}

export function paymentReceiptTemplate(params: PaymentReceiptParams): {
  subject: string;
  html: string;
} {
  const {
    invoiceNumber,
    amountPaidCents,
    paidAt,
    description,
    orgName,
    invoiceUrl,
    billingUrl,
  } = params;

  const amount = formatUsdFromCents(amountPaidCents);
  const subject = `Payment received — ${amount}`;

  const html = renderEmail({
    title: subject,
    preheader: `We received ${amount} for your Denku workspace. Nothing to do — this is your receipt.`,
    eyebrow: "Receipt",
    heading: `Payment received — ${amount}`,
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    tone: "positive",
    intro: "Thank you. Your payment went through and your AI keeps answering, uninterrupted.",
    blocks: [
      detailList([
        { label: "Amount", value: amount, strong: true },
        ...(description ? [{ label: "For", value: description }] : []),
        ...(invoiceNumber ? [{ label: "Invoice", value: invoiceNumber }] : []),
        { label: "Paid", value: formatDateLong(paidAt) },
        ...(orgName ? [{ label: "Workspace", value: orgName }] : []),
      ]),
    ],
    cta: invoiceUrl
      ? { label: "Download invoice", url: invoiceUrl }
      : { label: "View billing", url: billingUrl },
    ...(invoiceUrl ? { secondary: { label: "View billing history", url: billingUrl } } : {}),
    reason:
      "You're receiving this receipt because a payment was made on your Denku subscription.",
  });

  return { subject, html };
}

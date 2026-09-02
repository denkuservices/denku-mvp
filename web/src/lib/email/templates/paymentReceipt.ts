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
import { emailCopy, type EmailLocale } from "../i18n";

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
  locale?: EmailLocale;
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
    locale = "en",
  } = params;

  const amount = formatUsdFromCents(amountPaidCents, locale);
  const t = emailCopy(locale, {
    en: { subject: `Payment received — ${amount}`, preheader: `We received ${amount} for your Denku workspace. Nothing to do — this is your receipt.`, eyebrow: "Receipt", heading: `Payment received — ${amount}`, hi: "Hi", intro: "Thank you. Your payment went through and your AI keeps answering, uninterrupted.", amount: "Amount", for: "For", invoice: "Invoice", paid: "Paid", workspace: "Workspace", download: "Download invoice", billing: "View billing", history: "View billing history", reason: "You're receiving this receipt because a payment was made on your Denku subscription." },
    es: { subject: `Pago recibido — ${amount}`, preheader: `Recibimos ${amount} para tu espacio de trabajo Denku. No tienes que hacer nada; este es tu recibo.`, eyebrow: "Recibo", heading: `Pago recibido — ${amount}`, hi: "Hola", intro: "Gracias. El pago se completó y tu IA sigue respondiendo sin interrupciones.", amount: "Importe", for: "Concepto", invoice: "Factura", paid: "Pagado", workspace: "Espacio de trabajo", download: "Descargar factura", billing: "Ver facturación", history: "Ver historial de facturación", reason: "Recibes este recibo porque se realizó un pago de tu suscripción a Denku." },
    de: { subject: `Zahlung erhalten – ${amount}`, preheader: `Wir haben ${amount} für Ihren Denku-Arbeitsbereich erhalten. Dies ist Ihr Beleg; Sie müssen nichts tun.`, eyebrow: "Beleg", heading: `Zahlung erhalten – ${amount}`, hi: "Hallo", intro: "Vielen Dank. Ihre Zahlung war erfolgreich und Ihre KI antwortet ohne Unterbrechung weiter.", amount: "Betrag", for: "Für", invoice: "Rechnung", paid: "Bezahlt", workspace: "Arbeitsbereich", download: "Rechnung herunterladen", billing: "Abrechnung ansehen", history: "Abrechnungsverlauf ansehen", reason: "Sie erhalten diesen Beleg, weil eine Zahlung für Ihr Denku-Abonnement erfolgt ist." },
    tr: { subject: `Ödeme alındı — ${amount}`, preheader: `Denku çalışma alanınız için ${amount} ödeme aldık. İşlem yapmanız gerekmiyor; bu makbuzunuzdur.`, eyebrow: "Makbuz", heading: `Ödeme alındı — ${amount}`, hi: "Merhaba", intro: "Teşekkürler. Ödemeniz tamamlandı ve yapay zekânız kesintisiz yanıtlamaya devam ediyor.", amount: "Tutar", for: "Açıklama", invoice: "Fatura", paid: "Ödeme tarihi", workspace: "Çalışma alanı", download: "Faturayı indir", billing: "Faturalandırmayı görüntüle", history: "Fatura geçmişini görüntüle", reason: "Bu makbuzu Denku aboneliğiniz için ödeme yapıldığı için alıyorsunuz." },
  });
  const subject = t.subject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: "positive",
    intro: t.intro,
    blocks: [
      detailList([
        { label: t.amount, value: amount, strong: true },
        ...(description ? [{ label: t.for, value: description }] : []),
        ...(invoiceNumber ? [{ label: t.invoice, value: invoiceNumber }] : []),
        { label: t.paid, value: formatDateLong(paidAt, locale) },
        ...(orgName ? [{ label: t.workspace, value: orgName }] : []),
      ]),
    ],
    cta: invoiceUrl
      ? { label: t.download, url: invoiceUrl }
      : { label: t.billing, url: billingUrl },
    ...(invoiceUrl ? { secondary: { label: t.history, url: billingUrl } } : {}),
    reason: t.reason,
  });

  return { subject, html };
}

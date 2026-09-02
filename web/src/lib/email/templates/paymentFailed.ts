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
import { emailCopy, type EmailLocale } from "../i18n";

export interface PaymentFailedParams {
  amountDueCents: number;
  /** Stripe's next automatic retry, when it told us one. */
  nextAttemptAt?: string | Date | null;
  invoiceNumber?: string | null;
  orgName?: string | null;
  /** Stripe's hosted invoice page — where the customer can pay directly. */
  invoiceUrl?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}

export function paymentFailedTemplate(params: PaymentFailedParams): {
  subject: string;
  html: string;
} {
  const { amountDueCents, nextAttemptAt, invoiceNumber, orgName, invoiceUrl, billingUrl } =
    params;
  const locale = params.locale ?? "en";

  const amount = formatUsdFromCents(amountDueCents, locale);
  const t = emailCopy(locale, {
    en: { subject: "Payment failed — your Denku line is still answering, for now", preheader: `We couldn't collect ${amount}. Update your card to keep your AI answering calls.`, eyebrow: "Action needed", heading: "We couldn't take your payment", hi: "Hi", intro: "Your latest Denku payment didn't go through. In almost every case this is an expired or replaced card, and updating it takes a minute.", amount: "Amount due", invoice: "Invoice", next: "Next attempt", notice: "**Your AI is still answering.** If the payment keeps failing we pause the line, and callers stop reaching you — so it's worth sorting now.", pay: "Pay this invoice", update: "Update payment method", updateLong: "Update your payment method", signoff: "Already fixed it? Then ignore this — the next attempt will settle it.", reason: "You're receiving this because a payment on your Denku subscription failed. This is a service alert, not marketing." },
    es: { subject: "El pago falló — tu línea de Denku aún responde, por ahora", preheader: `No pudimos cobrar ${amount}. Actualiza tu tarjeta para que tu IA siga respondiendo.`, eyebrow: "Acción necesaria", heading: "No pudimos procesar tu pago", hi: "Hola", intro: "Tu último pago de Denku no se completó. Casi siempre se debe a una tarjeta caducada o sustituida; actualizarla lleva un minuto.", amount: "Importe pendiente", invoice: "Factura", next: "Próximo intento", notice: "**Tu IA todavía está respondiendo.** Si el pago sigue fallando, pausaremos la línea y dejarás de recibir llamadas; conviene resolverlo ahora.", pay: "Pagar esta factura", update: "Actualizar método de pago", updateLong: "Actualizar el método de pago", signoff: "¿Ya lo resolviste? Ignora este mensaje; el próximo intento lo confirmará.", reason: "Recibes este correo porque falló un pago de tu suscripción a Denku. Es una alerta de servicio, no de marketing." },
    de: { subject: "Zahlung fehlgeschlagen – Ihre Denku-Leitung antwortet vorerst weiter", preheader: `${amount} konnten nicht eingezogen werden. Aktualisieren Sie Ihre Karte, damit Ihre KI weiter antwortet.`, eyebrow: "Aktion erforderlich", heading: "Ihre Zahlung konnte nicht verarbeitet werden", hi: "Hallo", intro: "Ihre letzte Denku-Zahlung ist fehlgeschlagen. Meist ist die Karte abgelaufen oder ersetzt worden; die Aktualisierung dauert nur eine Minute.", amount: "Fälliger Betrag", invoice: "Rechnung", next: "Nächster Versuch", notice: "**Ihre KI antwortet noch.** Wenn die Zahlung weiter fehlschlägt, pausieren wir die Leitung und Anrufende erreichen Sie nicht mehr – klären Sie das daher jetzt.", pay: "Rechnung bezahlen", update: "Zahlungsmethode aktualisieren", updateLong: "Zahlungsmethode aktualisieren", signoff: "Schon erledigt? Dann ignorieren Sie diese Nachricht; der nächste Versuch gleicht die Zahlung aus.", reason: "Sie erhalten diese E-Mail, weil eine Zahlung für Ihr Denku-Abonnement fehlgeschlagen ist. Dies ist eine Servicewarnung, keine Werbung." },
    tr: { subject: "Ödeme başarısız — Denku hattınız şimdilik yanıtlamaya devam ediyor", preheader: `${amount} tahsil edilemedi. Yapay zekânızın yanıtlamaya devam etmesi için kartınızı güncelleyin.`, eyebrow: "İşlem gerekiyor", heading: "Ödemenizi alamadık", hi: "Merhaba", intro: "Son Denku ödemeniz tamamlanmadı. Bunun nedeni çoğunlukla süresi dolmuş veya değiştirilmiş bir karttır; güncellemek yalnızca bir dakika sürer.", amount: "Ödenecek tutar", invoice: "Fatura", next: "Sonraki deneme", notice: "**Yapay zekânız hâlâ yanıtlıyor.** Ödeme başarısız olmaya devam ederse hattı duraklatırız ve arayanlar size ulaşamaz; şimdi düzeltmenizde fayda var.", pay: "Bu faturayı öde", update: "Ödeme yöntemini güncelle", updateLong: "Ödeme yönteminizi güncelleyin", signoff: "Zaten düzelttiniz mi? Bu mesajı yok sayın; sonraki deneme ödemeyi tamamlayacaktır.", reason: "Bu e-postayı Denku aboneliğiniz için bir ödeme başarısız olduğu için alıyorsunuz. Bu bir hizmet uyarısıdır, pazarlama değildir." },
  });
  const subject = t.subject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: "warning",
    intro: t.intro,
    blocks: [
      detailList([
        { label: t.amount, value: amount, strong: true },
        ...(invoiceNumber ? [{ label: t.invoice, value: invoiceNumber }] : []),
        ...(nextAttemptAt
          ? [{ label: t.next, value: formatDateLong(nextAttemptAt, locale) }]
          : []),
      ]),
      notice(
        t.notice,
        "warning"
      ),
    ],
    cta: invoiceUrl
      ? { label: t.pay, url: invoiceUrl }
      : { label: t.update, url: billingUrl },
    ...(invoiceUrl ? { secondary: { label: t.updateLong, url: billingUrl } } : {}),
    signoff: t.signoff,
    reason: t.reason,
  });

  return { subject, html };
}

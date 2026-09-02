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
import { emailCopy, emailNumber, type EmailLocale } from "../i18n";

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
  locale?: EmailLocale;
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
    ctaLabel,
    locale = "en",
  } = params;
  const price = formatUsd(monthlyFeeUsd, locale);
  const overage = formatUsd(overageRateUsdPerMin, locale);
  const t = emailCopy(locale, {
    en: { subject: `Your ${planName} plan is active`, month: "month", minutes: "minutes included", eyebrow: "Subscription confirmed", hi: "Hi", intro: "Thank you — your subscription is live. Here's exactly what it includes, so there are no surprises later.", plan: "Plan", price: "Price", includedMinutes: "Included minutes", perMonth: "per month", phones: "Phone numbers", included: "included", calls: "Simultaneous calls", atOnce: "at once", beyond: "Beyond included", perMinute: "minute", notice: "We pause your line at 100% of the included minutes instead of letting overage build up quietly — and we warn you at 75% and 90% first.", cta: "Continue setup", receipt: "View your receipt", signoff: "You can change or cancel your plan at any time from billing settings.", reason: "You're receiving this because a subscription was purchased for your Denku workspace. It's a billing confirmation, not marketing." },
    es: { subject: `Tu plan ${planName} está activo`, month: "mes", minutes: "minutos incluidos", eyebrow: "Suscripción confirmada", hi: "Hola", intro: "Gracias; tu suscripción ya está activa. Esto es exactamente lo que incluye para que no haya sorpresas.", plan: "Plan", price: "Precio", includedMinutes: "Minutos incluidos", perMonth: "al mes", phones: "Números de teléfono", included: "incluidos", calls: "Llamadas simultáneas", atOnce: "a la vez", beyond: "Fuera de lo incluido", perMinute: "minuto", notice: "Pausamos la línea al llegar al 100% de los minutos incluidos para evitar cargos inesperados; antes te avisamos al 75% y al 90%.", cta: "Continuar configuración", receipt: "Ver recibo", signoff: "Puedes cambiar o cancelar tu plan en cualquier momento desde los ajustes de facturación.", reason: "Recibes este correo porque se compró una suscripción para tu espacio de trabajo Denku. Es una confirmación de facturación, no de marketing." },
    de: { subject: `Ihr Tarif ${planName} ist aktiv`, month: "Monat", minutes: "Minuten enthalten", eyebrow: "Abonnement bestätigt", hi: "Hallo", intro: "Vielen Dank – Ihr Abonnement ist aktiv. Hier sehen Sie genau, was enthalten ist, damit es später keine Überraschungen gibt.", plan: "Tarif", price: "Preis", includedMinutes: "Enthaltene Minuten", perMonth: "pro Monat", phones: "Telefonnummern", included: "enthalten", calls: "Gleichzeitige Anrufe", atOnce: "gleichzeitig", beyond: "Über Inklusivleistung", perMinute: "Minute", notice: "Bei 100 % der enthaltenen Minuten pausieren wir die Leitung, statt unbemerkt Mehrkosten entstehen zu lassen – vorher warnen wir Sie bei 75 % und 90 %.", cta: "Einrichtung fortsetzen", receipt: "Beleg ansehen", signoff: "Sie können Ihren Tarif jederzeit in den Abrechnungseinstellungen ändern oder kündigen.", reason: "Sie erhalten diese E-Mail, weil für Ihren Denku-Arbeitsbereich ein Abonnement gekauft wurde. Dies ist eine Abrechnungsbestätigung, keine Werbung." },
    tr: { subject: `${planName} planınız etkin`, month: "ay", minutes: "dakika dahil", eyebrow: "Abonelik onaylandı", hi: "Merhaba", intro: "Teşekkürler; aboneliğiniz etkin. Sonradan sürpriz yaşamamanız için nelerin dahil olduğunu burada açıkça görebilirsiniz.", plan: "Plan", price: "Fiyat", includedMinutes: "Dahil olan dakikalar", perMonth: "aylık", phones: "Telefon numaraları", included: "dahil", calls: "Eş zamanlı aramalar", atOnce: "aynı anda", beyond: "Dahil olanın sonrası", perMinute: "dakika", notice: "Habersiz ek ücret birikmemesi için dahil olan dakikaların %100'ünde hattı duraklatır, öncesinde %75 ve %90'da sizi uyarırız.", cta: "Kuruluma devam et", receipt: "Makbuzu görüntüle", signoff: "Planınızı faturalandırma ayarlarından istediğiniz zaman değiştirebilir veya iptal edebilirsiniz.", reason: "Bu e-postayı Denku çalışma alanınız için bir abonelik satın alındığı için alıyorsunuz. Bu bir faturalandırma onayıdır, pazarlama değildir." },
  });
  const subject = t.subject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: `${planName} · ${price}/${t.month} · ${emailNumber(includedMinutes, locale)} ${t.minutes}.`,
    eyebrow: t.eyebrow,
    heading: t.subject,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: "positive",
    intro: t.intro,
    blocks: [
      detailList([
        { label: t.plan, value: planName, strong: true },
        { label: t.price, value: `${price} / ${t.month}`, strong: true },
        { label: t.includedMinutes, value: `${emailNumber(includedMinutes, locale)} ${t.perMonth}` },
        {
          label: t.phones,
          value: `${includedPhoneNumbers} ${t.included}`,
        },
        {
          label: t.calls,
          value: `${concurrencyLimit} ${t.atOnce}`,
        },
        {
          label: t.beyond,
          value: `${overage} / ${t.perMinute}`,
        },
      ]),
      notice(
        t.notice,
        "neutral"
      ),
    ],
    cta: { label: ctaLabel ?? t.cta, url: ctaUrl },
    ...(invoiceUrl ? { secondary: { label: t.receipt, url: invoiceUrl } } : {}),
    signoff: t.signoff,
    reason: t.reason,
  });

  return { subject, html };
}

/**
 * Usage-threshold alert email (R-009) — "you've used X% of your included minutes",
 * sent as an org crosses 50/75/90% so the 100% pause is never a surprise. Pure.
 *
 * The number is the message, so it is set as a figure with a meter beneath it: a reader
 * glancing at this on a phone should learn where they stand without reading a sentence.
 */

import { renderEmail, figure, meter, detailList, type EmailTone } from "../layout";
import { emailCopy, emailNumber, type EmailLocale } from "../i18n";

export function usageAlertTemplate(params: {
  thresholdPct: number;
  billableMinutes: number;
  includedMinutes: number;
  orgName?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string } {
  const { thresholdPct, billableMinutes, includedMinutes, orgName, billingUrl, locale = "en" } = params;
  const t = emailCopy(locale, {
    en: { subject: `You've used ${thresholdPct}% of your included minutes`, preheader: `${emailNumber(billableMinutes, locale)} of ${emailNumber(includedMinutes, locale)} included minutes used this month — about ${emailNumber(Math.max(includedMinutes - billableMinutes, 0), locale)} left.`, eyebrow: "Usage", heading: `You've used ${thresholdPct}% of this month's minutes`, hi: "Hi", figure: "of your included minutes, used so far this month", used: "Used", included: "Included", remaining: "Remaining", unit: "min", urgent: "Your AI is close to this month's included minutes. At 100% we pause the line rather than let overage charges build up quietly — so it's worth a look now.", normal: "No action needed. This is a heads-up so you always know where your usage stands.", cta: "View usage & billing", reason: "You're receiving this usage alert for your Denku workspace. It's a service email, not marketing." },
    es: { subject: `Has usado el ${thresholdPct}% de tus minutos incluidos`, preheader: `${emailNumber(billableMinutes, locale)} de ${emailNumber(includedMinutes, locale)} minutos incluidos usados este mes; quedan unos ${emailNumber(Math.max(includedMinutes - billableMinutes, 0), locale)}.`, eyebrow: "Uso", heading: `Has usado el ${thresholdPct}% de los minutos de este mes`, hi: "Hola", figure: "de tus minutos incluidos usados este mes", used: "Usados", included: "Incluidos", remaining: "Restantes", unit: "min", urgent: "Tu IA está cerca de agotar los minutos incluidos de este mes. Al llegar al 100% pausamos la línea para evitar cargos adicionales inesperados; conviene revisarlo ahora.", normal: "No tienes que hacer nada. Es un aviso para que siempre sepas cómo va tu uso.", cta: "Ver uso y facturación", reason: "Recibes esta alerta de uso por tu espacio de trabajo Denku. Es un correo de servicio, no de marketing." },
    de: { subject: `Sie haben ${thresholdPct} % Ihrer enthaltenen Minuten verbraucht`, preheader: `${emailNumber(billableMinutes, locale)} von ${emailNumber(includedMinutes, locale)} enthaltenen Minuten wurden diesen Monat verbraucht – etwa ${emailNumber(Math.max(includedMinutes - billableMinutes, 0), locale)} verbleiben.`, eyebrow: "Nutzung", heading: `Sie haben ${thresholdPct} % der Minuten dieses Monats verbraucht`, hi: "Hallo", figure: "Ihrer enthaltenen Minuten wurden diesen Monat verbraucht", used: "Verbraucht", included: "Enthalten", remaining: "Verbleibend", unit: "Min.", urgent: "Ihre KI nähert sich den in diesem Monat enthaltenen Minuten. Bei 100 % pausieren wir die Leitung, statt unbemerkt Mehrkosten entstehen zu lassen – prüfen Sie die Nutzung daher jetzt.", normal: "Keine Aktion nötig. Dieser Hinweis sorgt dafür, dass Sie Ihren Verbrauch jederzeit kennen.", cta: "Nutzung & Abrechnung ansehen", reason: "Sie erhalten diese Nutzungswarnung für Ihren Denku-Arbeitsbereich. Dies ist eine Service-E-Mail, keine Werbung." },
    tr: { subject: `Dahil olan dakikalarınızın %${thresholdPct} kadarını kullandınız`, preheader: `Bu ay dahil olan ${emailNumber(includedMinutes, locale)} dakikanın ${emailNumber(billableMinutes, locale)} dakikası kullanıldı; yaklaşık ${emailNumber(Math.max(includedMinutes - billableMinutes, 0), locale)} dakika kaldı.`, eyebrow: "Kullanım", heading: `Bu ayki dakikaların %${thresholdPct} kadarını kullandınız`, hi: "Merhaba", figure: "bu ay dahil olan dakikalarınızdan kullanıldı", used: "Kullanılan", included: "Dahil", remaining: "Kalan", unit: "dk", urgent: "Yapay zekânız bu ay dahil olan dakikalara yaklaştı. Sessizce ek ücret birikmemesi için %100'de hattı duraklatıyoruz; şimdi kontrol etmenizde fayda var.", normal: "İşlem yapmanız gerekmiyor. Bu bildirim, kullanımınızı her zaman bilmeniz için gönderildi.", cta: "Kullanım ve faturayı görüntüle", reason: "Bu kullanım uyarısını Denku çalışma alanınız için alıyorsunuz. Bu bir hizmet e-postasıdır, pazarlama değildir." },
  });

  const subject = t.subject;
  const remaining = Math.max(includedMinutes - billableMinutes, 0);
  // 90% is the last warning before the line pauses at 100%, so it gets the louder tone.
  const tone: EmailTone = thresholdPct >= 90 ? "warning" : "neutral";

  const html = renderEmail({
    locale,
    title: subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone,
    blocks: [
      figure(`${thresholdPct}%`, t.figure, tone),
      meter(thresholdPct, tone),
      detailList([
        { label: t.used, value: `${emailNumber(billableMinutes, locale)} ${t.unit}` },
        { label: t.included, value: `${emailNumber(includedMinutes, locale)} ${t.unit}` },
        { label: t.remaining, value: `${emailNumber(remaining, locale)} ${t.unit}`, strong: true },
      ]),
    ],
    intro:
      thresholdPct >= 90
        ? t.urgent
        : t.normal,
    cta: { label: t.cta, url: billingUrl },
    reason: t.reason,
  });

  return { subject, html };
}

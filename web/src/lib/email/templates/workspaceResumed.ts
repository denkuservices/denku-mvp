/**
 * "Your line is answering again" — the close of the loop that `workspacePaused` opens.
 *
 * A pause email with no matching resume leaves the customer permanently unsure whether
 * their phone works, which is the worst state to leave a business in. This is short on
 * purpose: the only fact that matters is that calls are being answered again.
 */

import { renderEmail, notice } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export type ResumeReason = "payment_received" | "plan_upgraded" | "manual";

export function workspaceResumedTemplate(params: {
  reason?: ResumeReason;
  orgName?: string | null;
  dashboardUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string } {
  const { reason = "payment_received", orgName, dashboardUrl, locale = "en" } = params;
  const t = emailCopy(locale, {
    en: { subject: "Your Denku AI line is answering again", plan: "Your plan change went through, so we lifted the pause.", manual: "The pause on your workspace has been lifted.", paid: "Your payment came through, so we lifted the pause.", preheader: "Your AI is back on the line and answering calls, 24/7.", eyebrow: "Service restored", heading: "Your AI is answering again", hi: "Hi", tail: "Your number is bound to your AI again and calls are being answered right now.", notice: "Calls that came in while the line was paused were handled by your carrier, not by us, so they don't appear in your dashboard.", cta: "Open your dashboard", reason: "You're receiving this because your Denku workspace was paused and has now resumed. It's a service alert, not marketing." },
    es: { subject: "Tu línea de IA de Denku vuelve a responder", plan: "El cambio de plan se completó y levantamos la pausa.", manual: "Se ha levantado la pausa de tu espacio de trabajo.", paid: "Recibimos tu pago y levantamos la pausa.", preheader: "Tu IA vuelve a estar en la línea y responde llamadas, 24/7.", eyebrow: "Servicio restablecido", heading: "Tu IA vuelve a responder", hi: "Hola", tail: "Tu número vuelve a estar conectado a tu IA y las llamadas se están respondiendo ahora.", notice: "Las llamadas recibidas durante la pausa fueron gestionadas por tu operador, no por nosotros, por lo que no aparecen en tu panel.", cta: "Abrir el panel", reason: "Recibes este correo porque tu espacio de trabajo Denku estuvo pausado y ya se reanudó. Es una alerta de servicio, no de marketing." },
    de: { subject: "Ihre Denku-KI-Leitung antwortet wieder", plan: "Ihre Tarifänderung wurde abgeschlossen, daher haben wir die Pause aufgehoben.", manual: "Die Pause Ihres Arbeitsbereichs wurde aufgehoben.", paid: "Ihre Zahlung ist eingegangen, daher haben wir die Pause aufgehoben.", preheader: "Ihre KI ist wieder erreichbar und beantwortet rund um die Uhr Anrufe.", eyebrow: "Service wiederhergestellt", heading: "Ihre KI antwortet wieder", hi: "Hallo", tail: "Ihre Nummer ist wieder mit Ihrer KI verbunden und Anrufe werden jetzt beantwortet.", notice: "Anrufe während der Pause wurden von Ihrem Anbieter und nicht von uns bearbeitet. Daher erscheinen sie nicht in Ihrem Dashboard.", cta: "Dashboard öffnen", reason: "Sie erhalten diese E-Mail, weil Ihr Denku-Arbeitsbereich pausiert war und nun wieder aktiv ist. Dies ist eine Servicewarnung, keine Werbung." },
    tr: { subject: "Denku yapay zekâ hattınız yeniden yanıtlıyor", plan: "Plan değişikliğiniz tamamlandı; bu nedenle duraklatmayı kaldırdık.", manual: "Çalışma alanınızdaki duraklatma kaldırıldı.", paid: "Ödemeniz ulaştı; bu nedenle duraklatmayı kaldırdık.", preheader: "Yapay zekânız yeniden hatta ve 7/24 aramaları yanıtlıyor.", eyebrow: "Hizmet yeniden başladı", heading: "Yapay zekânız yeniden yanıtlıyor", hi: "Merhaba", tail: "Numaranız yeniden yapay zekânıza bağlandı ve aramalar şu anda yanıtlanıyor.", notice: "Hat duraklatılmışken gelen aramaları biz değil operatörünüz yönettiği için bu aramalar kontrol panelinizde görünmez.", cta: "Kontrol panelini aç", reason: "Bu e-postayı Denku çalışma alanınız duraklatıldıktan sonra yeniden başladığı için alıyorsunuz. Bu bir hizmet uyarısıdır, pazarlama değildir." },
  });

  const subject = t.subject;

  const cause =
    reason === "plan_upgraded"
      ? t.plan
      : reason === "manual"
      ? t.manual
      : t.paid;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: "positive",
    intro: `${cause} ${t.tail}`,
    blocks: [
      notice(
        t.notice,
        "neutral"
      ),
    ],
    cta: { label: t.cta, url: dashboardUrl },
    reason: t.reason,
  });

  return { subject, html };
}

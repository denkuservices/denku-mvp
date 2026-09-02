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
import { emailCopy, type EmailLocale } from "../i18n";

export interface SubscriptionCanceledParams {
  state: "scheduled" | "ended";
  planName?: string | null;
  /** When access ends (scheduled) or ended (ended). */
  effectiveAt?: string | Date | null;
  orgName?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}

export function subscriptionCanceledTemplate(params: SubscriptionCanceledParams): {
  subject: string;
  html: string;
} {
  const { state, planName, effectiveAt, orgName, billingUrl, locale = "en" } = params;
  const scheduled = state === "scheduled";
  const when = effectiveAt ? formatDateLong(effectiveAt, locale) : null;
  const t = emailCopy(locale, {
    en: { scheduledSubject: "Your Denku subscription is set to end", endedSubject: "Your Denku subscription has ended", until: "until", untilPeriod: "until the end of your billing period", scheduledPre: "Your AI keeps answering", restart: "You can restart any time before then.", endedPre: "Your AI has stopped answering calls. Your data stays in your workspace.", eyebrow: "Subscription", scheduledHeading: "Your subscription will end", endedHeading: "Your subscription has ended", hi: "Hi", scheduledIntro: "We've scheduled your cancellation. Nothing changes yet — your AI keeps answering until the end of the period you've already paid for.", endedIntro: "Your plan has ended and your AI has stopped answering. We're sorry to see you go.", plan: "Plan", ends: "Ends", ended: "Ended", period: "End of the current billing period", scheduledNotice: "When the plan ends we release your US phone number back to the carrier. **A released number can't be recovered** — restart before then to keep it.", endedNotice: "Your calls, tickets and contacts stay in your workspace and you can export them any time. The phone number has been released back to the carrier.", keep: "Keep my plan", newPlan: "Start a new plan", signoff: "If something pushed you to this, reply and tell us — we read every one of these.", reason: "You're receiving this because your Denku subscription changed. It's a billing notice, not marketing." },
    es: { scheduledSubject: "Tu suscripción de Denku está programada para terminar", endedSubject: "Tu suscripción de Denku ha terminado", until: "hasta", untilPeriod: "hasta el final del período de facturación", scheduledPre: "Tu IA seguirá respondiendo", restart: "Puedes reactivarla en cualquier momento antes de esa fecha.", endedPre: "Tu IA dejó de responder llamadas. Tus datos permanecen en el espacio de trabajo.", eyebrow: "Suscripción", scheduledHeading: "Tu suscripción terminará", endedHeading: "Tu suscripción ha terminado", hi: "Hola", scheduledIntro: "Programamos la cancelación. Aún no cambia nada: tu IA seguirá respondiendo hasta el final del período que ya pagaste.", endedIntro: "Tu plan terminó y tu IA dejó de responder. Sentimos verte partir.", plan: "Plan", ends: "Termina", ended: "Terminó", period: "Fin del período de facturación actual", scheduledNotice: "Cuando termine el plan devolveremos tu número de EE. UU. al operador. **Un número liberado no se puede recuperar**; reactiva el plan antes para conservarlo.", endedNotice: "Tus llamadas, solicitudes y contactos permanecen en el espacio de trabajo y puedes exportarlos cuando quieras. El número fue devuelto al operador.", keep: "Conservar mi plan", newPlan: "Iniciar un nuevo plan", signoff: "Si algo te llevó a cancelar, responde y cuéntanoslo; leemos todos estos mensajes.", reason: "Recibes este correo porque cambió tu suscripción de Denku. Es un aviso de facturación, no de marketing." },
    de: { scheduledSubject: "Ihr Denku-Abonnement wird beendet", endedSubject: "Ihr Denku-Abonnement ist beendet", until: "bis", untilPeriod: "bis zum Ende Ihres Abrechnungszeitraums", scheduledPre: "Ihre KI antwortet weiter", restart: "Bis dahin können Sie jederzeit neu starten.", endedPre: "Ihre KI beantwortet keine Anrufe mehr. Ihre Daten bleiben im Arbeitsbereich.", eyebrow: "Abonnement", scheduledHeading: "Ihr Abonnement wird enden", endedHeading: "Ihr Abonnement ist beendet", hi: "Hallo", scheduledIntro: "Ihre Kündigung ist vorgemerkt. Vorerst ändert sich nichts – Ihre KI antwortet bis zum Ende des bereits bezahlten Zeitraums weiter.", endedIntro: "Ihr Tarif ist beendet und Ihre KI antwortet nicht mehr. Schade, dass Sie gehen.", plan: "Tarif", ends: "Endet", ended: "Beendet", period: "Ende des aktuellen Abrechnungszeitraums", scheduledNotice: "Nach Tarifende geben wir Ihre US-Telefonnummer an den Anbieter zurück. **Eine freigegebene Nummer kann nicht wiederhergestellt werden** – starten Sie vorher neu, um sie zu behalten.", endedNotice: "Ihre Anrufe, Anfragen und Kontakte bleiben im Arbeitsbereich und können jederzeit exportiert werden. Die Telefonnummer wurde an den Anbieter zurückgegeben.", keep: "Meinen Tarif behalten", newPlan: "Neuen Tarif starten", signoff: "Wenn etwas Sie dazu bewegt hat, antworten Sie uns – wir lesen jede dieser Nachrichten.", reason: "Sie erhalten diese E-Mail, weil sich Ihr Denku-Abonnement geändert hat. Dies ist ein Abrechnungshinweis, keine Werbung." },
    tr: { scheduledSubject: "Denku aboneliğiniz sona erecek şekilde ayarlandı", endedSubject: "Denku aboneliğiniz sona erdi", until: "şu tarihe kadar", untilPeriod: "fatura döneminizin sonuna kadar", scheduledPre: "Yapay zekânız yanıtlamaya devam eder", restart: "O zamana kadar istediğiniz an yeniden başlatabilirsiniz.", endedPre: "Yapay zekânız aramaları yanıtlamayı durdurdu. Verileriniz çalışma alanınızda kalır.", eyebrow: "Abonelik", scheduledHeading: "Aboneliğiniz sona erecek", endedHeading: "Aboneliğiniz sona erdi", hi: "Merhaba", scheduledIntro: "İptalinizi planladık. Şimdilik hiçbir şey değişmez; yapay zekânız ödediğiniz dönemin sonuna kadar yanıtlamaya devam eder.", endedIntro: "Planınız sona erdi ve yapay zekânız yanıtlamayı durdurdu. Ayrılmanıza üzüldük.", plan: "Plan", ends: "Bitiş", ended: "Sona erdi", period: "Mevcut fatura döneminin sonu", scheduledNotice: "Plan sona erdiğinde ABD telefon numaranızı operatöre iade ederiz. **İade edilen numara geri alınamaz**; numarayı korumak için öncesinde yeniden başlatın.", endedNotice: "Aramalarınız, talepleriniz ve kişileriniz çalışma alanınızda kalır; istediğiniz zaman dışa aktarabilirsiniz. Telefon numarası operatöre iade edildi.", keep: "Planımı koru", newPlan: "Yeni plan başlat", signoff: "Sizi buna iten bir şey olduysa yanıtlayıp bize anlatın; bu e-postaların hepsini okuyoruz.", reason: "Bu e-postayı Denku aboneliğiniz değiştiği için alıyorsunuz. Bu bir faturalandırma bildirimidir, pazarlama değildir." },
  });
  const subject = scheduled ? t.scheduledSubject : t.endedSubject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: scheduled
      ? `${t.scheduledPre} ${when ? `${t.until} ${when}` : t.untilPeriod}. ${t.restart}`
      : t.endedPre,
    eyebrow: t.eyebrow,
    heading: scheduled ? t.scheduledHeading : t.endedHeading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: scheduled ? "warning" : "neutral",
    intro: scheduled
      ? t.scheduledIntro
      : t.endedIntro,
    blocks: [
      detailList([
        ...(planName ? [{ label: t.plan, value: planName }] : []),
        {
          label: scheduled ? t.ends : t.ended,
          value: when ?? t.period,
          strong: true,
        },
      ]),
      notice(
        scheduled
          ? t.scheduledNotice
          : t.endedNotice,
        scheduled ? "warning" : "neutral"
      ),
    ],
    cta: {
      label: scheduled ? t.keep : t.newPlan,
      url: billingUrl,
    },
    signoff: t.signoff,
    reason: t.reason,
  });

  return { subject, html };
}

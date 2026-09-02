/**
 * Workspace-paused alert email (R-009) — sent to the owner when billing pauses the
 * workspace (hard_cap or past_due), so a business phone never goes dead silently.
 * Pure; caller resolves recipient + sends.
 *
 * This is the most consequential mail Denku sends: while it sits unread, the customer's
 * calls are going unanswered. So it says what stopped, why, and the single thing that
 * restarts it — and nothing else.
 */

import { renderEmail, notice, steps } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export type PauseReason = "hard_cap" | "past_due";

export function workspacePausedTemplate(params: {
  reason: PauseReason;
  orgName?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string } {
  const { reason, orgName, billingUrl, locale = "en" } = params;

  const isHardCap = reason === "hard_cap";
  const t = emailCopy(locale, {
    en: { hardSubject: "Your Denku AI line is paused — usage cap reached", dueSubject: "Your Denku AI line is paused — payment needed", hardReason: "You've used all of your plan's included minutes this month, so we paused the line rather than let overage charges build up unannounced.", dueReason: "A recent payment didn't go through, so we paused the line while the account is past due.", hardAction: "Upgrade your plan or raise your usage limit to start answering again.", dueAction: "Update your payment method to start answering again.", hardPreheader: "Your included minutes are used up and your AI is not answering calls right now.", duePreheader: "A payment failed and your AI is not answering calls right now.", eyebrow: "Service paused", heading: "Your AI line has been paused", hi: "Hi", notice: "**Your AI is not answering calls right now.** Callers hear your carrier's unavailable message until the line resumes.", hardSteps: ["Open billing and upgrade your plan, or raise the usage limit.", "The line resumes automatically — usually within a minute."], dueSteps: ["Open billing and update your payment method.", "Once the payment clears, the line resumes automatically."], cta: "Manage billing", reason: "You're receiving this because your Denku phone line was paused. This is a service alert, not marketing." },
    es: { hardSubject: "Tu línea de IA de Denku está pausada — límite de uso alcanzado", dueSubject: "Tu línea de IA de Denku está pausada — pago pendiente", hardReason: "Has usado todos los minutos incluidos de tu plan este mes. Pausamos la línea para evitar cargos adicionales inesperados.", dueReason: "No se pudo procesar un pago reciente, así que pausamos la línea mientras la cuenta está vencida.", hardAction: "Mejora tu plan o aumenta el límite de uso para volver a responder.", dueAction: "Actualiza el método de pago para volver a responder.", hardPreheader: "Has agotado los minutos incluidos y tu IA no está respondiendo llamadas ahora.", duePreheader: "Un pago falló y tu IA no está respondiendo llamadas ahora.", eyebrow: "Servicio pausado", heading: "Tu línea de IA ha sido pausada", hi: "Hola", notice: "**Tu IA no está respondiendo llamadas ahora.** Quienes llaman oyen el mensaje de no disponibilidad de tu operador hasta que se reanude la línea.", hardSteps: ["Abre la facturación y mejora tu plan o aumenta el límite de uso.", "La línea se reanuda automáticamente, normalmente en menos de un minuto."], dueSteps: ["Abre la facturación y actualiza el método de pago.", "Cuando se confirme el pago, la línea se reanudará automáticamente."], cta: "Gestionar facturación", reason: "Recibes este correo porque tu línea telefónica de Denku fue pausada. Es una alerta de servicio, no de marketing." },
    de: { hardSubject: "Ihre Denku-KI-Leitung ist pausiert – Nutzungslimit erreicht", dueSubject: "Ihre Denku-KI-Leitung ist pausiert – Zahlung erforderlich", hardReason: "Sie haben alle in Ihrem Tarif enthaltenen Minuten für diesen Monat verbraucht. Wir haben die Leitung pausiert, damit nicht unbemerkt Mehrkosten entstehen.", dueReason: "Eine kürzliche Zahlung ist fehlgeschlagen. Daher ist die Leitung pausiert, solange das Konto überfällig ist.", hardAction: "Wechseln Sie den Tarif oder erhöhen Sie das Nutzungslimit, damit Anrufe wieder beantwortet werden.", dueAction: "Aktualisieren Sie Ihre Zahlungsmethode, damit Anrufe wieder beantwortet werden.", hardPreheader: "Ihre enthaltenen Minuten sind verbraucht und Ihre KI beantwortet derzeit keine Anrufe.", duePreheader: "Eine Zahlung ist fehlgeschlagen und Ihre KI beantwortet derzeit keine Anrufe.", eyebrow: "Service pausiert", heading: "Ihre KI-Leitung wurde pausiert", hi: "Hallo", notice: "**Ihre KI beantwortet derzeit keine Anrufe.** Bis zur Fortsetzung hören Anrufende die Nicht-erreichbar-Nachricht Ihres Anbieters.", hardSteps: ["Öffnen Sie die Abrechnung und wechseln Sie den Tarif oder erhöhen Sie das Nutzungslimit.", "Die Leitung wird automatisch fortgesetzt – normalerweise innerhalb einer Minute."], dueSteps: ["Öffnen Sie die Abrechnung und aktualisieren Sie Ihre Zahlungsmethode.", "Sobald die Zahlung eingeht, wird die Leitung automatisch fortgesetzt."], cta: "Abrechnung verwalten", reason: "Sie erhalten diese E-Mail, weil Ihre Denku-Telefonleitung pausiert wurde. Dies ist eine Servicewarnung, keine Werbung." },
    tr: { hardSubject: "Denku yapay zekâ hattınız duraklatıldı — kullanım sınırına ulaşıldı", dueSubject: "Denku yapay zekâ hattınız duraklatıldı — ödeme gerekiyor", hardReason: "Bu ay planınıza dahil olan tüm dakikaları kullandınız. Habersiz ek ücret oluşmaması için hattı duraklattık.", dueReason: "Son ödeme alınamadığı için hesabın borcu varken hattı duraklattık.", hardAction: "Tekrar yanıtlamaya başlamak için planınızı yükseltin veya kullanım sınırınızı artırın.", dueAction: "Tekrar yanıtlamaya başlamak için ödeme yönteminizi güncelleyin.", hardPreheader: "Dahil olan dakikalarınız tükendi ve yapay zekânız şu anda aramaları yanıtlamıyor.", duePreheader: "Bir ödeme başarısız oldu ve yapay zekânız şu anda aramaları yanıtlamıyor.", eyebrow: "Hizmet duraklatıldı", heading: "Yapay zekâ hattınız duraklatıldı", hi: "Merhaba", notice: "**Yapay zekânız şu anda aramaları yanıtlamıyor.** Hat yeniden başlayana kadar arayanlar operatörünüzün ulaşılamıyor mesajını duyar.", hardSteps: ["Faturalandırmayı açıp planınızı yükseltin veya kullanım sınırını artırın.", "Hat otomatik olarak, genellikle bir dakika içinde yeniden başlar."], dueSteps: ["Faturalandırmayı açıp ödeme yönteminizi güncelleyin.", "Ödeme tamamlandığında hat otomatik olarak yeniden başlar."], cta: "Faturalandırmayı yönet", reason: "Bu e-postayı Denku telefon hattınız duraklatıldığı için alıyorsunuz. Bu bir hizmet uyarısıdır, pazarlama değildir." },
  });
  const subject = isHardCap ? t.hardSubject : t.dueSubject;
  const reasonLine = isHardCap ? t.hardReason : t.dueReason;
  const action = isHardCap ? t.hardAction : t.dueAction;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: isHardCap
      ? t.hardPreheader
      : t.duePreheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: "critical",
    intro: reasonLine,
    blocks: [
      notice(
        t.notice,
        "critical"
      ),
      steps(
        isHardCap
          ? t.hardSteps
          : t.dueSteps,
        "critical"
      ),
    ],
    cta: { label: t.cta, url: billingUrl },
    signoff: action,
    reason: t.reason,
  });

  return { subject, html };
}

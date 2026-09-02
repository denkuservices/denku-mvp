/**
 * "Your AI is live" — sent once, when activation finishes and a real US number is bound
 * to the assistant.
 *
 * This is the product's single proudest moment and it had no email. The number is the
 * payload: a business owner should be able to find this message months later and get
 * the line they bought, which is why it is set as a figure rather than buried in a
 * sentence, and why the mail asks them to call it right now — a customer who has heard
 * their own AI answer is a customer who believes the product.
 */

import { renderEmail, figure, steps, notice } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

/** `+13215551234` → `+1 (321) 555-1234`. Falls back to the raw string for anything else. */
export function formatUsPhone(e164: string): string {
  const digits = e164.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

export interface AiLiveParams {
  phoneNumberE164: string;
  orgName?: string | null;
  dashboardUrl: string;
  locale?: EmailLocale;
}

export function aiLiveTemplate(params: AiLiveParams): { subject: string; html: string } {
  const { phoneNumberE164, orgName, dashboardUrl, locale = "en" } = params;
  const pretty = formatUsPhone(phoneNumberE164);
  const t = emailCopy(locale, {
    en: { subject: `Your AI is live on ${pretty}`, preheader: `${pretty} is answering now, 24/7. Call it and hear your AI for yourself.`, eyebrow: "You're live", heading: "Your AI employee is answering", hi: "Hi", intro: "Setup is done. Your number is provisioned and your AI is on the line — every hour of every day, including the ones you're asleep for.", figure: "Your Denku number — answering 24/7", steps: ["**Call it now.** Hearing your own AI answer takes thirty seconds and tells you more than any dashboard.", "Forward your existing business line to this number when you're ready — nothing changes for your callers.", "Watch the tickets, appointments and contacts land in your dashboard after each call."], notice: "Every finished call becomes something you can act on — a ticket or an appointment request — even when the caller rambles. You'll get an email as they come in.", cta: "Open your dashboard", signoff: "Anything sounding off in the greeting? Reply to this email and we'll tune it with you.", reason: "You're receiving this because your Denku workspace finished activation." },
    es: { subject: `Tu IA ya está activa en ${pretty}`, preheader: `${pretty} ya responde, 24/7. Llama y escucha tu IA.`, eyebrow: "Ya está activa", heading: "Tu empleado de IA está respondiendo", hi: "Hola", intro: "La configuración terminó. Tu número está listo y tu IA está en la línea a toda hora, incluso mientras duermes.", figure: "Tu número de Denku — responde 24/7", steps: ["**Llama ahora.** Escuchar responder a tu propia IA lleva treinta segundos y explica más que cualquier panel.", "Cuando quieras, desvía tu línea empresarial a este número; nada cambia para quienes llaman.", "Después de cada llamada verás solicitudes, citas y contactos en tu panel."], notice: "Cada llamada finalizada se convierte en algo accionable —una solicitud o una cita— aunque quien llame se extienda. Te avisaremos por correo.", cta: "Abrir el panel", signoff: "¿Algo no suena bien en el saludo? Responde a este correo y lo ajustaremos contigo.", reason: "Recibes este correo porque terminó la activación de tu espacio de trabajo Denku." },
    de: { subject: `Ihre KI ist unter ${pretty} erreichbar`, preheader: `${pretty} antwortet jetzt rund um die Uhr. Rufen Sie an und hören Sie Ihre KI selbst.`, eyebrow: "Sie sind live", heading: "Ihr KI-Mitarbeiter antwortet", hi: "Hallo", intro: "Die Einrichtung ist abgeschlossen. Ihre Nummer ist bereit und Ihre KI ist rund um die Uhr erreichbar – auch während Sie schlafen.", figure: "Ihre Denku-Nummer – rund um die Uhr erreichbar", steps: ["**Rufen Sie jetzt an.** Ihre eigene KI antworten zu hören dauert dreißig Sekunden und zeigt mehr als jedes Dashboard.", "Leiten Sie Ihre bestehende Geschäftsnummer weiter, sobald Sie bereit sind – für Anrufende ändert sich nichts.", "Nach jedem Anruf erscheinen Anfragen, Termine und Kontakte in Ihrem Dashboard."], notice: "Jeder abgeschlossene Anruf wird zu einer Aufgabe oder Terminanfrage – auch wenn Anrufende abschweifen. Sie erhalten dazu eine E-Mail.", cta: "Dashboard öffnen", signoff: "Klingt die Begrüßung nicht richtig? Antworten Sie auf diese E-Mail; wir passen sie gemeinsam an.", reason: "Sie erhalten diese E-Mail, weil die Aktivierung Ihres Denku-Arbeitsbereichs abgeschlossen ist." },
    tr: { subject: `Yapay zekânız ${pretty} numarasında yayında`, preheader: `${pretty} artık 7/24 yanıtlıyor. Arayın ve yapay zekânızı kendiniz duyun.`, eyebrow: "Artık yayındasınız", heading: "Yapay zekâ çalışanınız yanıtlıyor", hi: "Merhaba", intro: "Kurulum tamamlandı. Numaranız hazır ve yapay zekânız siz uyurken bile günün her saati hatta.", figure: "Denku numaranız — 7/24 yanıtlıyor", steps: ["**Şimdi arayın.** Kendi yapay zekânızın yanıtını duymak otuz saniye sürer ve herhangi bir panelden daha fazlasını anlatır.", "Hazır olduğunuzda mevcut işletme hattınızı bu numaraya yönlendirin; arayanlar için hiçbir şey değişmez.", "Her aramadan sonra talepleri, randevuları ve kişileri kontrol panelinizde görün."], notice: "Tamamlanan her arama, arayan kişi konuyu uzatsa bile işlem yapabileceğiniz bir talebe veya randevu isteğine dönüşür. Geldikçe e-posta alırsınız.", cta: "Kontrol panelini aç", signoff: "Karşılama cümlesinde ters gelen bir şey mi var? Bu e-postayı yanıtlayın, birlikte düzeltelim.", reason: "Bu e-postayı Denku çalışma alanınızın etkinleştirilmesi tamamlandığı için alıyorsunuz." },
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
      figure(pretty, t.figure, "positive"),
      steps(t.steps, "positive"),
      notice(
        t.notice,
        "positive"
      ),
    ],
    cta: { label: t.cta, url: dashboardUrl },
    signoff: t.signoff,
    reason: t.reason,
  });

  return { subject, html };
}

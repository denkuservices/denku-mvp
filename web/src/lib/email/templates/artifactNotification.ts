/**
 * Artifact notification email (R-008) — sent to the workspace owner when the AI
 * captures a new ticket or appointment from a conversation. Makes the core "never miss
 * a call" value visible between logins.
 *
 * Pure and dependency-free (unit-tested): takes already-resolved fields and returns
 * `{ subject, html }`. Recipient resolution, idempotency, and sending live in
 * `lib/notifications/artifactNotifications.ts`.
 *
 * Escaping is not optional here: the title and snippet come from a caller's own words.
 * The shared helpers in `../layout` escape everything they are given.
 */

import { renderEmail, detailList, quote } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export type ArtifactKind = "ticket" | "appointment";

export interface ArtifactNotificationParams {
  kind: ArtifactKind;
  /** Human title, e.g. the ticket subject or "Appointment request". */
  title: string;
  /** Caller display (name or masked phone), optional. */
  caller?: string | null;
  /** Short transcript/summary snippet, optional. */
  snippet?: string | null;
  /** Absolute deep link into the dashboard for this artifact. */
  deepLink: string;
  /** Workspace name, for the greeting. Optional. */
  orgName?: string | null;
  locale?: EmailLocale;
}

export function artifactNotificationTemplate(
  params: ArtifactNotificationParams
): { subject: string; html: string } {
  const { kind, title, caller, snippet, deepLink, orgName, locale = "en" } = params;
  const t = emailCopy(locale, {
    en: { appointment: "appointment request", ticket: "ticket", newAppointment: "New appointment request", newTicket: "New ticket", request: "Request", subject: "Subject", from: "From", captured: "Captured by", employee: "Your AI employee", conversation: "From the conversation", hi: "Hi", appointmentIntro: "Someone asked to book time with you. Nothing is confirmed until you accept it.", ticketIntro: "Someone got in touch and your AI turned the conversation into a work item.", view: "View", reason: "You're receiving this because your AI employee created a work item from a conversation. You can turn these off in your workspace settings." },
    es: { appointment: "solicitud de cita", ticket: "solicitud", newAppointment: "Nueva solicitud de cita", newTicket: "Nueva solicitud", request: "Solicitud", subject: "Asunto", from: "De", captured: "Capturado por", employee: "Tu empleado de IA", conversation: "De la conversación", hi: "Hola", appointmentIntro: "Alguien pidió reservar tiempo contigo. Nada queda confirmado hasta que lo aceptes.", ticketIntro: "Alguien se puso en contacto y tu IA convirtió la conversación en una tarea.", view: "Ver", reason: "Recibes este correo porque tu empleado de IA creó una tarea a partir de una conversación. Puedes desactivar estos avisos en los ajustes del espacio de trabajo." },
    de: { appointment: "Terminanfrage", ticket: "Anfrage", newAppointment: "Neue Terminanfrage", newTicket: "Neue Anfrage", request: "Anfrage", subject: "Betreff", from: "Von", captured: "Erfasst von", employee: "Ihr KI-Mitarbeiter", conversation: "Aus der Unterhaltung", hi: "Hallo", appointmentIntro: "Jemand möchte einen Termin mit Ihnen buchen. Bestätigt ist er erst, wenn Sie ihn annehmen.", ticketIntro: "Jemand hat Kontakt aufgenommen und Ihre KI hat daraus eine Aufgabe erstellt.", view: "Ansehen", reason: "Sie erhalten diese E-Mail, weil Ihr KI-Mitarbeiter aus einer Unterhaltung eine Aufgabe erstellt hat. Sie können diese Benachrichtigungen in den Arbeitsbereichseinstellungen deaktivieren." },
    tr: { appointment: "randevu talebi", ticket: "talep", newAppointment: "Yeni randevu talebi", newTicket: "Yeni talep", request: "Talep", subject: "Konu", from: "Gönderen", captured: "Oluşturan", employee: "Yapay zekâ çalışanınız", conversation: "Konuşmadan", hi: "Merhaba", appointmentIntro: "Birisi sizinle görüşmek için randevu istedi. Siz kabul edene kadar hiçbir şey kesinleşmez.", ticketIntro: "Birisi iletişime geçti ve yapay zekânız konuşmayı bir iş öğesine dönüştürdü.", view: "Görüntüle", reason: "Bu e-postayı yapay zekâ çalışanınız bir konuşmadan iş öğesi oluşturduğu için alıyorsunuz. Bu bildirimleri çalışma alanı ayarlarından kapatabilirsiniz." },
  });

  const noun = kind === "appointment" ? t.appointment : t.ticket;
  const subject =
    kind === "appointment"
      ? `${t.newAppointment} — ${title}`
      : `${t.newTicket} — ${title}`;

  const blocks = [
    detailList([
      { label: kind === "appointment" ? t.request : t.subject, value: title, strong: true },
      ...(caller ? [{ label: t.from, value: caller }] : []),
      { label: t.captured, value: t.employee },
    ]),
    ...(snippet ? [quote(snippet, t.conversation)] : []),
  ];

  const html = renderEmail({
    locale,
    title: subject,
    preheader: `${t.employee} — ${noun}${caller ? ` · ${caller}` : ""}.`,
    eyebrow: kind === "appointment" ? t.newAppointment : t.newTicket,
    heading: `${t.employee}: ${noun}`,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    intro:
      kind === "appointment"
        ? t.appointmentIntro
        : t.ticketIntro,
    tone: "positive",
    blocks,
    cta: { label: `${t.view} ${noun}`, url: deepLink },
    reason: t.reason,
  });

  return { subject, html };
}

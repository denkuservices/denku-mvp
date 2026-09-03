/**
 * A request from the public site, delivered to the people who can answer it.
 *
 * Until 2026-09-03 the landing-page forms wrote a row into `contact_requests` and did nothing
 * else: no mail, no ticket, no screen anywhere read the table. A real prospect could fill the form
 * and the only way to learn about it was to query the database by hand. This is the mail half of
 * closing that; the ticket half lands in Denku's own workspace.
 *
 * Written for someone about to reply, so it leads with the person and their words. `quote()` for
 * the message they typed — it is the only part they actually composed, and burying it in a detail
 * row would make it look like metadata.
 */

import { renderEmail, detailList, quote, notice } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

/** Which form on the site this came from. Mirrors the allowlist in the contact route. */
export type ContactRequestSource =
  | "marketing_contact"
  | "request_ai-employees"
  | "request_ai-audit"
  | "request_ai-studio"
  | "request_custom-ai";

const SOURCE_LABEL: Record<ContactRequestSource, string> = {
  marketing_contact: "Contact form",
  "request_ai-employees": "AI Employees",
  "request_ai-audit": "AI Audit",
  "request_ai-studio": "AI Studio",
  "request_custom-ai": "Custom AI",
};

/** A label for a source we do not recognise, rather than printing a raw enum at a human. */
export function sourceLabel(source: string | null | undefined): string {
  const key = (source ?? "").trim() as ContactRequestSource;
  return SOURCE_LABEL[key] ?? SOURCE_LABEL.marketing_contact;
}

export interface ContactRequestParams {
  workEmail: string;
  name?: string | null;
  company?: string | null;
  industry?: string | null;
  channels?: string[] | null;
  tools?: string | null;
  estimatedVolume?: string | null;
  message?: string | null;
  source?: string | null;
  /** Deep link to the ticket this became, when one was created. */
  ticketUrl?: string | null;
  locale?: EmailLocale;
}

export function contactRequestTemplate(params: ContactRequestParams): {
  subject: string;
  html: string;
} {
  const {
    workEmail,
    name,
    company,
    industry,
    channels,
    tools,
    estimatedVolume,
    message,
    source,
    ticketUrl,
    locale = "en",
  } = params;

  const form = sourceLabel(source);
  /** Who to call this person, without ever printing an empty line. */
  const who = (name || "").trim() || (company || "").trim() || workEmail;

  const t = emailCopy(locale, {
    en: {
      subject: `${form} request — ${who}`,
      preheader: `${who} asked about ${form}. Reply to ${workEmail}.`,
      eyebrow: "New request",
      heading: "Someone asked to talk to us",
      intro: `A request came in from the ${form} form on the website. Everything they filled in is below — reply straight to their address.`,
      form: "Form",
      name: "Name",
      company: "Company",
      email: "Work email",
      industry: "Industry",
      channels: "Channels",
      tools: "Tools",
      volume: "Estimated volume",
      messageFrom: "What they wrote",
      cta: "Open the request",
      noTicket: "This request is saved. It did not become a ticket — check the dashboard later, or reply to the address above.",
      reason: "You're receiving this because a request was submitted on denku.io.",
    },
    tr: {
      subject: `${form} talebi — ${who}`,
      preheader: `${who}, ${form} hakkında bilgi istedi. ${workEmail} adresine yanıt verin.`,
      eyebrow: "Yeni talep",
      heading: "Biri sizinle konuşmak istiyor",
      intro: `Web sitesindeki ${form} formundan bir talep geldi. Doldurduğu her şey aşağıda — doğrudan kendi adresine yanıt verebilirsiniz.`,
      form: "Form",
      name: "Ad",
      company: "Şirket",
      email: "İş e-postası",
      industry: "Sektör",
      channels: "Kanallar",
      tools: "Araçlar",
      volume: "Tahmini hacim",
      messageFrom: "Yazdıkları",
      cta: "Talebi aç",
      noTicket: "Talep kaydedildi. Ticket'a dönüşmedi — panele daha sonra bakın ya da yukarıdaki adrese yanıt verin.",
      reason: "Bu e-postayı denku.io üzerinden bir talep gönderildiği için alıyorsunuz.",
    },
    es: {
      subject: `Solicitud de ${form} — ${who}`,
      preheader: `${who} preguntó por ${form}. Responde a ${workEmail}.`,
      eyebrow: "Nueva solicitud",
      heading: "Alguien quiere hablar con nosotros",
      intro: `Llegó una solicitud desde el formulario ${form} del sitio web. Todo lo que completó está abajo; responde directamente a su dirección.`,
      form: "Formulario",
      name: "Nombre",
      company: "Empresa",
      email: "Correo de trabajo",
      industry: "Sector",
      channels: "Canales",
      tools: "Herramientas",
      volume: "Volumen estimado",
      messageFrom: "Lo que escribió",
      cta: "Abrir la solicitud",
      noTicket: "La solicitud está guardada. No se convirtió en un ticket; revisa el panel más tarde o responde a la dirección de arriba.",
      reason: "Recibes este correo porque se envió una solicitud en denku.io.",
    },
    de: {
      subject: `${form}-Anfrage — ${who}`,
      preheader: `${who} hat nach ${form} gefragt. Antworten Sie an ${workEmail}.`,
      eyebrow: "Neue Anfrage",
      heading: "Jemand möchte mit uns sprechen",
      intro: `Über das ${form}-Formular auf der Website ist eine Anfrage eingegangen. Alle Angaben stehen unten — antworten Sie direkt an die Adresse.`,
      form: "Formular",
      name: "Name",
      company: "Unternehmen",
      email: "Geschäftliche E-Mail",
      industry: "Branche",
      channels: "Kanäle",
      tools: "Tools",
      volume: "Geschätztes Volumen",
      messageFrom: "Was geschrieben wurde",
      cta: "Anfrage öffnen",
      noTicket: "Die Anfrage ist gespeichert. Sie wurde nicht zu einem Ticket — sehen Sie später im Dashboard nach oder antworten Sie an die obige Adresse.",
      reason: "Sie erhalten diese E-Mail, weil auf denku.io eine Anfrage gesendet wurde.",
    },
  });

  // Only rows that were actually filled in. A form with four optional fields left blank should
  // read as a short email, not as a table of dashes.
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: t.form, value: form },
    { label: t.email, value: workEmail, strong: true },
  ];
  if (name?.trim()) rows.splice(1, 0, { label: t.name, value: name.trim() });
  if (company?.trim()) rows.push({ label: t.company, value: company.trim() });
  if (industry?.trim()) rows.push({ label: t.industry, value: industry.trim() });
  if (channels && channels.length > 0) rows.push({ label: t.channels, value: channels.join(", ") });
  if (tools?.trim()) rows.push({ label: t.tools, value: tools.trim() });
  if (estimatedVolume?.trim()) rows.push({ label: t.volume, value: estimatedVolume.trim() });

  const blocks = [detailList(rows)];
  if (message?.trim()) blocks.push(quote(message.trim(), who));
  if (!ticketUrl) blocks.push(notice(t.noTicket, "neutral"));

  const html = renderEmail({
    locale,
    title: t.subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    tone: "positive",
    intro: t.intro,
    blocks,
    // The button only exists when there is somewhere to send them. A CTA that points at a
    // dashboard list because the ticket write failed is worse than no CTA.
    ...(ticketUrl ? { cta: { label: t.cta, url: ticketUrl } } : {}),
    reason: t.reason,
  });

  return { subject: t.subject, html };
}

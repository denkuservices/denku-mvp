/**
 * The Denku email layout — one chrome, every message.
 *
 * Before this file each template hand-rolled its own HTML, and the estate had drifted
 * into four different looks: an indigo `#4f46e5` auth email from the first week, a
 * slate-and-emoji notification style, a bare `system-ui` invite, and a welcome mail
 * with a fake "D" logo tile. None of them carried the brand. Every template now renders
 * through `renderEmail()`, so the chrome (dark masthead with the vortex mark, copper
 * hairline, bone ground, serif headings, one button style, one footer) is written once.
 *
 * What the structure is fighting:
 * - **Outlook (Word engine)** ignores `border-radius`, `max-width` on divs, and most
 *   modern CSS. Hence tables all the way down, fixed 600px, and a VML fallback behind
 *   every button.
 * - **Gmail** strips `<style>` selectively but honours it more than folklore claims;
 *   critical styling is still inlined, with `<style>` used only for the mobile media
 *   query and link colours.
 * - **Forced dark mode** (Gmail/Outlook mobile) inverts unpredictably. `color-scheme:
 *   light` + explicit `bgcolor` on every container keeps the palette intact.
 *
 * Text passed to these helpers is escaped here — templates hand in plain strings and a
 * tiny `**bold**` convention, never raw HTML — because most of what mail interpolates
 * (a business name, a caller's words, a subject typed by a stranger in the web widget)
 * is not ours.
 */

import { EMAIL_COLORS as C, EMAIL_FONTS as F, EMAIL_LINKS, EMAIL_LOGO_CID, EMAIL_LOGO_URL, esc } from "./brand";
import { emailText, normalizeEmailLocale, type EmailLocale } from "./i18n";

/**
 * The emotional register of a message, which picks the accent colour used by the
 * button, the eyebrow and any notice bar. Nothing else about the layout changes:
 * a paused workspace and a welcome must look like the same company wrote them.
 */
export type EmailTone = "neutral" | "positive" | "warning" | "critical";

const TONE_ACCENT: Record<EmailTone, string> = {
  neutral: C.teal,
  positive: C.success,
  warning: C.copperDeep,
  critical: C.danger,
};

/** Button fill per tone. Neutral uses the brand's dark ground — the most "signed" look. */
const TONE_BUTTON: Record<EmailTone, string> = {
  neutral: C.ink,
  positive: C.ink,
  warning: C.copperDeep,
  critical: C.danger,
};

const TONE_WASH: Record<EmailTone, { bg: string; border: string }> = {
  neutral: { bg: "#F2F6F5", border: "#D8E6E3" },
  positive: { bg: "#F1F8F4", border: "#CFE7DA" },
  warning: { bg: "#FBF4EC", border: "#EBD9C3" },
  critical: { bg: "#FBF1EF", border: "#EFD3CD" },
};

/**
 * Inline emphasis without letting templates hand us HTML.
 * `**text**` → `<strong>`. Applied AFTER escaping, so the markers are the only markup
 * that can survive from a caller's string.
 */
function inline(text: string): string {
  return esc(text).replace(
    /\*\*([^*]+)\*\*/g,
    `<strong style="color:${C.inkText};font-weight:600;">$1</strong>`
  );
}

/* ------------------------------------------------------------------ *
 * Content blocks — each returns a table row's worth of HTML.
 * ------------------------------------------------------------------ */

/** A body paragraph. Supports `**bold**`. */
export function paragraph(text: string, opts: { size?: number; color?: string; top?: number } = {}): string {
  const { size = 15, color = C.body, top = 0 } = opts;
  return `<p style="margin:${top}px 0 16px 0;font-family:${F.body};font-size:${size}px;line-height:1.7;color:${color};">${inline(
    text
  )}</p>`;
}

/** A quiet inset panel — the place for context that is not the message itself. */
export function panel(innerHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td bgcolor="${C.boneRaised}" style="background-color:${C.boneRaised};border:1px solid ${C.line};border-radius:14px;padding:20px 22px;">
      ${innerHtml}
    </td></tr>
  </table>`;
}

/**
 * Label/value rows — receipts, plan details, appointment facts.
 * Rendered as a table so Outlook keeps the columns; long values wrap under the label
 * on narrow screens via the `stack` class in the head styles.
 */
export function detailList(rows: Array<{ label: string; value: string; strong?: boolean }>): string {
  const body = rows
    .filter((r) => r.value !== "" && r.value !== null && r.value !== undefined)
    .map(
      (r, i) => `<tr>
        <td class="stack" style="padding:${i === 0 ? "0" : "12px"} 16px 12px 0;font-family:${F.body};font-size:12px;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};white-space:nowrap;vertical-align:top;border-top:${
        i === 0 ? "none" : `1px solid ${C.lineSoft}`
      };">${esc(r.label)}</td>
        <td class="stack" align="right" style="padding:${i === 0 ? "0" : "12px"} 0 12px 0;font-family:${F.body};font-size:${
        r.strong ? "16px" : "15px"
      };line-height:1.5;color:${C.inkText};font-weight:${r.strong ? 700 : 500};vertical-align:top;border-top:${
        i === 0 ? "none" : `1px solid ${C.lineSoft}`
      };">${inline(r.value)}</td>
      </tr>`
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">${body}</table>`;
}

/**
 * A single figure with a caption — "412 of 400 minutes", "$1,240.00".
 * The number is set in the display serif: it is the one thing the reader must see
 * before deciding whether to keep reading.
 */
export function figure(value: string, caption: string, tone: EmailTone = "neutral"): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td style="padding:0 0 4px 0;font-family:${F.display};font-size:34px;line-height:1.1;color:${TONE_ACCENT[tone]};letter-spacing:-0.02em;">${esc(
      value
    )}</td></tr>
    <tr><td style="font-family:${F.body};font-size:13px;line-height:1.6;color:${C.muted};">${inline(caption)}</td></tr>
  </table>`;
}

/**
 * A usage meter. Email cannot animate or measure, so this is two nested tables with
 * hard percentages — the only bar that renders identically in Outlook and Gmail.
 */
export function meter(percent: number, tone: EmailTone = "neutral"): string {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const accent = TONE_ACCENT[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td bgcolor="${C.boneRaised}" style="background-color:${C.boneRaised};border-radius:999px;padding:0;font-size:0;line-height:0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${pct}%" style="width:${pct}%;">
        <tr><td bgcolor="${accent}" height="8" style="background-color:${accent};border-radius:999px;height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>
    </td></tr>
  </table>`;
}

/** A short quotation — a transcript snippet, a customer's message. */
export function quote(text: string, attribution?: string | null): string {
  const trimmed = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  const by = attribution
    ? `<p style="margin:12px 0 0 0;font-family:${F.body};font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};">${esc(
        attribution
      )}</p>`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td style="border-left:2px solid ${C.copper};padding:2px 0 2px 18px;">
      <p style="margin:0;font-family:${F.display};font-size:16px;line-height:1.7;color:${C.inkText};white-space:pre-wrap;">${esc(
        trimmed
      )}</p>
      ${by}
    </td></tr>
  </table>`;
}

/** A tinted notice — the one place a template may raise its voice. */
export function notice(text: string, tone: EmailTone = "warning"): string {
  const wash = TONE_WASH[tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td bgcolor="${wash.bg}" style="background-color:${wash.bg};border:1px solid ${wash.border};border-radius:14px;padding:16px 20px;">
      <p style="margin:0;font-family:${F.body};font-size:14px;line-height:1.65;color:${C.inkText};">${inline(text)}</p>
    </td></tr>
  </table>`;
}

/** An ordered list of next steps, numbered in the accent colour. */
export function steps(items: string[], tone: EmailTone = "neutral"): string {
  const accent = TONE_ACCENT[tone];
  const rows = items
    .map(
      (item, i) => `<tr>
      <td width="28" style="padding:0 0 14px 0;font-family:${F.display};font-size:15px;line-height:1.6;color:${accent};vertical-align:top;">${i + 1}.</td>
      <td style="padding:0 0 14px 0;font-family:${F.body};font-size:15px;line-height:1.6;color:${C.body};vertical-align:top;">${inline(item)}</td>
    </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px 0;">${rows}</table>`;
}

/** A monospaced code — verification codes, addresses to copy. */
export function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
    <tr><td align="center" bgcolor="${C.boneRaised}" style="background-color:${C.boneRaised};border:1px solid ${C.line};border-radius:14px;padding:22px 20px;font-family:${F.mono};font-size:30px;line-height:1.2;letter-spacing:0.22em;color:${C.inkText};font-weight:700;">${esc(
      code
    )}</td></tr>
  </table>`;
}

/** The "or paste this link" fallback that keeps a mail usable when the button fails. */
export function linkFallback(url: string, locale?: EmailLocale): string {
  const label = emailText(locale, {
    en: "Or paste this link into your browser:",
    es: "O pega este enlace en tu navegador:",
    de: "Oder fügen Sie diesen Link in Ihren Browser ein:",
    tr: "Ya da bu bağlantıyı tarayıcınıza yapıştırın:",
  });
  return `<p style="margin:0 0 8px 0;font-family:${F.body};font-size:12px;line-height:1.6;color:${C.muted};">${esc(label)}</p>
  <p style="margin:0 0 24px 0;font-family:${F.mono};font-size:12px;line-height:1.6;color:${C.teal};word-break:break-all;">${esc(
    url
  )}</p>`;
}

/** A hairline. */
export function divider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;"><tr><td height="1" bgcolor="${C.lineSoft}" style="background-color:${C.lineSoft};height:1px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/* ------------------------------------------------------------------ *
 * The button — bulletproof (VML for the Word engine).
 * ------------------------------------------------------------------ */

function button(label: string, url: string, tone: EmailTone): string {
  const bg = TONE_BUTTON[tone];
  const href = esc(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
    <tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:12px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="24%" stroke="f" fillcolor="${bg}"><w:anchorlock/><center style="color:${C.bone};font-family:${F.body};font-size:15px;font-weight:600;"><![endif]-->
      <a href="${href}" style="display:inline-block;padding:16px 34px;font-family:${F.body};font-size:15px;font-weight:600;line-height:1;color:${C.bone};text-decoration:none;border-radius:12px;background-color:${bg};">${esc(
        label
      )}</a>
      <!--[if mso]></center></v:roundrect><![endif]-->
    </td></tr>
  </table>`;
}

/** A quiet secondary action, rendered as a link rather than a second button. */
function secondaryLink(label: string, url: string): string {
  return `<p style="margin:16px 0 0 0;font-family:${F.body};font-size:14px;line-height:1.6;">
    <a href="${esc(url)}" style="color:${C.teal};text-decoration:underline;">${esc(label)}</a>
  </p>`;
}

/* ------------------------------------------------------------------ *
 * The chrome.
 * ------------------------------------------------------------------ */

export interface RenderEmailInput {
  /** Recipient language. English remains the legacy fallback. */
  locale?: EmailLocale;
  /** `<title>` — also what a screen reader announces first. */
  title: string;
  /** The inbox preview line. Never leave this to chance: without it clients scrape the masthead. */
  preheader: string;
  /** Small-caps label above the heading, e.g. "Billing" or "Your workspace". */
  eyebrow?: string;
  heading: string;
  /** "Hi Acme Dental," — omitted when the org name is unknown. */
  greeting?: string | null;
  /** Lead paragraph. Supports `**bold**`. */
  intro?: string;
  tone?: EmailTone;
  /** Pre-rendered blocks from the helpers above, in order. */
  blocks?: string[];
  /**
   * Blocks that belong AFTER the button — the "or paste this link" fallback, chiefly.
   * A fallback printed above the action it is a fallback for reads as the primary path,
   * which is exactly backwards.
   */
  postCta?: string[];
  cta?: { label: string; url: string } | null;
  secondary?: { label: string; url: string } | null;
  /** The honest "why you are receiving this" line. Every template must set one. */
  reason: string;
  /** Optional closing line under the CTA, before the footer. */
  signoff?: string | null;
  /**
   * How the masthead mark is referenced.
   *
   * `"inline"` (the default) points at the CID attachment every Denku send carries, so the mark
   * is part of the message and cannot be blocked. `"remote"` points at denku.io and exists for
   * exactly one caller: the script that generates the Supabase Auth templates, which Supabase
   * renders from its own dashboard and which therefore has no attachment to reference.
   *
   * Getting this backwards is silent — the mark simply does not appear — so the default is the
   * one that works for the 19 emails this repo sends itself.
   */
  logo?: "inline" | "remote";
}

export function renderEmail(input: RenderEmailInput): string {
  const {
    title,
    preheader,
    eyebrow,
    heading,
    greeting,
    intro,
    tone = "neutral",
    blocks = [],
    postCta = [],
    cta,
    secondary,
    reason,
    signoff,
    locale: localeInput,
    logo = "inline",
  } = input;

  /**
   * The masthead mark, and the fallback for when it cannot be shown.
   *
   * `cid:` resolves against the attachment every Denku send carries (`lib/email/inlineLogo.ts`);
   * `"remote"` is for the Supabase-rendered templates, which have no attachment to point at.
   *
   * The `<img>` below carries a STYLED `alt`, which is not decoration. An unstyled alt renders in
   * the client's default colour — near-black — on a masthead that is deliberately near-black, so
   * on the one occasion the mark cannot be drawn the fallback would be invisible too. Bone, at the
   * mark's own line height, means the worst case is a wordmark rather than a hole.
   *
   * Kept as a TS comment rather than an HTML one: this explains the code, and an HTML comment
   * would be shipped down the wire in every email, four times over in the Supabase templates.
   */
  const logoSrc = logo === "remote" ? EMAIL_LOGO_URL : `cid:${EMAIL_LOGO_CID}`;

  const locale = normalizeEmailLocale(localeInput);
  const footer = {
    dashboard: emailText(locale, { en: "Dashboard", es: "Panel", de: "Dashboard", tr: "Kontrol paneli" }),
    support: emailText(locale, { en: "Support", es: "Soporte", de: "Support", tr: "Destek" }),
    privacy: emailText(locale, { en: "Privacy", es: "Privacidad", de: "Datenschutz", tr: "Gizlilik" }),
    terms: emailText(locale, { en: "Terms", es: "Términos", de: "Bedingungen", tr: "Koşullar" }),
    tagline: emailText(locale, {
      en: "AI employees that answer every call, message and email.",
      es: "Empleados de IA que responden cada llamada, mensaje y correo.",
      de: "KI-Mitarbeiter, die jeden Anruf, jede Nachricht und jede E-Mail beantworten.",
      tr: "Her aramayı, mesajı ve e-postayı yanıtlayan yapay zekâ çalışanları.",
    }),
  };

  const accent = TONE_ACCENT[tone];
  const year = new Date().getUTCFullYear();

  const eyebrowHtml = eyebrow
    ? `<p style="margin:0 0 12px 0;font-family:${F.body};font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:${accent};">${esc(
        eyebrow
      )}</p>`
    : "";

  const greetingHtml = greeting
    ? `<p style="margin:0 0 10px 0;font-family:${F.body};font-size:15px;line-height:1.6;color:${C.muted};">${esc(
        greeting
      )}</p>`
    : "";

  const introHtml = intro ? paragraph(intro, { size: 16 }) : "";
  const ctaHtml = cta ? button(cta.label, cta.url, tone) : "";
  const secondaryHtml = secondary ? secondaryLink(secondary.label, secondary.url) : "";
  const signoffHtml = signoff
    ? `<p style="margin:28px 0 0 0;font-family:${F.body};font-size:15px;line-height:1.7;color:${C.body};">${inline(
        signoff
      )}</p>`
    : "";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${locale}">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style type="text/css">
  :root { color-scheme: light; supported-color-schemes: light; }
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
  a { color:${C.teal}; }
  .body-link { color:${C.teal}; text-decoration:underline; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:24px !important; padding-right:24px !important; }
    .masthead { padding-left:24px !important; padding-right:24px !important; }
    .stack { display:block !important; width:100% !important; text-align:left !important; white-space:normal !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.bone};" bgcolor="${C.bone}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.bone};">${esc(
    preheader
  )}&#8203;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;&#847;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bone}" style="background-color:${C.bone};">
  <tr>
    <td align="center" style="padding:40px 12px 56px 12px;">
      <table role="presentation" class="wrap" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">

        <!-- masthead -->
        <tr>
          <td class="masthead" bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:20px 20px 0 0;padding:28px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:12px;vertical-align:middle;">
                  <img src="${logoSrc}" width="34" height="34" alt="Denku" style="display:block;width:34px;height:34px;border:0;font-family:${F.display};font-size:20px;line-height:34px;color:${C.bone};" />
                </td>
                <td style="vertical-align:middle;font-family:${F.display};font-size:24px;line-height:1;letter-spacing:-0.02em;color:${C.bone};">denku</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- copper hairline: the signature under the mark -->
        <tr><td height="3" bgcolor="${C.copper}" style="background-color:${C.copper};height:3px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- card -->
        <tr>
          <td class="pad" bgcolor="${C.surface}" style="background-color:${C.surface};padding:40px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
            ${eyebrowHtml}
            ${greetingHtml}
            <h1 style="margin:0 0 16px 0;font-family:${F.display};font-size:28px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:${C.inkText};">${esc(
              heading
            )}</h1>
            ${introHtml}
            ${blocks.join("\n")}
            ${ctaHtml}
            ${postCta.join("")}
            ${secondaryHtml}
            ${signoffHtml}
          </td>
        </tr>

        <!-- card foot -->
        <tr>
          <td class="pad" bgcolor="${C.surface}" style="background-color:${C.surface};padding:0 40px 36px 40px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-bottom:1px solid ${C.line};border-radius:0 0 20px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr><td height="1" bgcolor="${C.lineSoft}" style="background-color:${C.lineSoft};height:1px;font-size:0;line-height:0;">&nbsp;</td></tr>
              <tr><td style="padding-top:20px;font-family:${F.body};font-size:12px;line-height:1.7;color:${C.muted};">${esc(
                reason
              )}</td></tr>
            </table>
          </td>
        </tr>

        <!-- footer -->
        <tr>
          <td class="pad" style="padding:28px 40px 0 40px;" align="center">
            <p style="margin:0 0 10px 0;font-family:${F.body};font-size:12px;line-height:1.8;color:${C.muted};">
              <a href="${EMAIL_LINKS.dashboard}" style="color:${C.muted};text-decoration:none;">${esc(footer.dashboard)}</a>
              &nbsp;·&nbsp;
              <a href="${EMAIL_LINKS.support}" style="color:${C.muted};text-decoration:none;">${esc(footer.support)}</a>
              &nbsp;·&nbsp;
              <a href="${EMAIL_LINKS.privacy}" style="color:${C.muted};text-decoration:none;">${esc(footer.privacy)}</a>
              &nbsp;·&nbsp;
              <a href="${EMAIL_LINKS.terms}" style="color:${C.muted};text-decoration:none;">${esc(footer.terms)}</a>
            </p>
            <p style="margin:0;font-family:${F.body};font-size:11px;line-height:1.8;color:${C.muted};letter-spacing:0.04em;">
              © ${year} Denku · ${esc(footer.tagline)}
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

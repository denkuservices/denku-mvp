/**
 * Brand tokens for transactional email.
 *
 * Email is the one surface where the design system cannot be imported — no Tailwind,
 * no CSS variables, no webfont beyond what the reader already has. So the landing
 * system's palette (doc 17 / LANDING_V3_DESIGN_PLAN §3) is restated here as literal
 * hex, and every template reads it from this file. Change a value here and the whole
 * mail estate moves with it.
 *
 * Deliberate constraints, learned from what actually renders:
 * - **No SVG.** Gmail, Outlook and Yahoo all drop `<svg>`. The vortex mark ships as a
 *   PNG (`/public/email/denku-mark.png`, rasterised from `app/icon.svg`) at 4× the
 *   display size so it stays crisp on retina.
 * - **No webfont for the wordmark.** Fraunces is not installable in mail, so the
 *   display voice is a serif stack led by Georgia — the closest thing to the brand's
 *   warm serif that is already on every machine.
 * - **Absolute asset URLs on the canonical host.** A relative path or a preview-host
 *   URL is a broken image in someone's inbox forever (the R-077 class of defect).
 */

import { siteConfig } from "@/config/site";
import { EMAIL_LOCALE_TAG, normalizeEmailLocale, type EmailLocale } from "./i18n";

/** The landing system's palette, restated for mail. */
export const EMAIL_COLORS = {
  /** Near-black with a teal undertone — the brand's dark ground. */
  ink: "#0A1414",
  /** Deep navy-ink used for headings on light grounds. */
  inkText: "#0A1A2F",
  /** Bone — the page ground behind the card. */
  bone: "#F7F5F1",
  /** Slightly warmer bone, for inset panels. */
  boneRaised: "#F1EDE6",
  /** Card. */
  surface: "#FFFFFF",
  /** Hairlines on bone. */
  line: "#E5DFD5",
  /** Hairlines inside the card. */
  lineSoft: "#EDE8E0",
  /** Body copy. */
  body: "#41505E",
  /** Secondary/meta copy. */
  muted: "#7A8794",
  /** Brand teal (deep) — eyebrows, links. */
  teal: "#17635E",
  /** Brand teal (lifted) — accents on dark. */
  tealLifted: "#2FA39A",
  /** Copper — the signature accent. */
  copper: "#C89468",
  /** Copper (deep) — warning tone that stays in the palette. */
  copperDeep: "#A9713F",
  /** Alert red, warmed so it belongs to this palette rather than a generic UI kit. */
  danger: "#A33A2E",
  /** Success green, muted to sit beside teal. */
  success: "#1F7A5C",
} as const;

export const EMAIL_FONTS = {
  /** Display / headings — the closest ubiquitous stand-in for Fraunces. */
  display: "Georgia, 'Times New Roman', 'Iowan Old Style', serif",
  /** Body — the reader's own UI sans. */
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  /** Codes, numbers meant to be read one character at a time. */
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

/** Canonical host for assets referenced from an inbox. Never a preview host. */
const ASSET_HOST = siteConfig.url.replace(/\/+$/, "");

/** Absolute URL for an emailed asset (e.g. `emailAsset("/email/denku-mark.png")`). */
export function emailAsset(path: string): string {
  return `${ASSET_HOST}${path.startsWith("/") ? path : `/${path}`}`;
}

export const EMAIL_LOGO_URL = emailAsset("/email/denku-mark.png");

/** Public marketing/legal links shown in every footer. */
export const EMAIL_LINKS = {
  site: ASSET_HOST,
  dashboard: `${ASSET_HOST}/dashboard`,
  support: `${ASSET_HOST}/support`,
  privacy: `${ASSET_HOST}/privacy`,
  terms: `${ASSET_HOST}/terms`,
} as const;

/**
 * Escape text that will be embedded in HTML.
 *
 * Most of what these templates interpolate is caller-controlled (a transcript, a
 * business name, a subject line typed by a stranger on the web-chat widget), so
 * escaping is the default and un-escaped interpolation must be a deliberate act.
 */
export function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** `1234.5` → `$1,234.50`. Amounts are always shown to the cent in billing mail. */
export function formatUsd(amount: number, locale?: EmailLocale): string {
  return `$${amount.toLocaleString(EMAIL_LOCALE_TAG[normalizeEmailLocale(locale)], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Stripe amounts arrive in cents. */
export function formatUsdFromCents(cents: number, locale?: EmailLocale): string {
  return formatUsd(cents / 100, locale);
}

/** `2026-09-01` / Date → `1 September 2026`. */
export function formatDateLong(value: string | Date, locale?: EmailLocale): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";
  const normalized = normalizeEmailLocale(locale);
  const dateLocale = normalized === "en" ? "en-GB" : EMAIL_LOCALE_TAG[normalized];
  return date.toLocaleDateString(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

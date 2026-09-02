import type { Locale } from "@/i18n/routing";

export type EmailLocale = Locale;

export type EmailTranslations = Readonly<Record<EmailLocale, string>>;

export const EMAIL_LOCALE_TAG: Record<EmailLocale, string> = {
  en: "en-US",
  es: "es-ES",
  de: "de-DE",
  tr: "tr-TR",
};

export function normalizeEmailLocale(value: unknown): EmailLocale {
  return value === "es" || value === "de" || value === "tr" ? value : "en";
}

export function emailText(locale: EmailLocale | undefined, copy: EmailTranslations): string {
  return copy[normalizeEmailLocale(locale)];
}

/** Select an entire strongly-typed copy bundle, useful for keeping one template readable. */
export function emailCopy<T>(
  locale: EmailLocale | undefined,
  copy: Readonly<Record<EmailLocale, T>>,
): T {
  return copy[normalizeEmailLocale(locale)];
}

export function emailNumber(value: number, locale: EmailLocale | undefined): string {
  return value.toLocaleString(EMAIL_LOCALE_TAG[normalizeEmailLocale(locale)]);
}

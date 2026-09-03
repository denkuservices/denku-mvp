import { defineRouting } from "next-intl/routing";

/**
 * Locale routing for the marketing site.
 *
 * `localePrefix: "as-needed"` keeps English at the root (`/pricing`, not
 * `/en/pricing`) and prefixes the rest (`/tr/pricing`). That preserves every URL
 * the site already has — existing links, the sitemap and anything already indexed
 * keep working — while giving the other three languages their own crawlable paths.
 *
 * Marketing uses locale-prefixed routes. The authenticated dashboard stays outside
 * `[locale]` and reads the same locale from its persisted cookie/profile preference.
 */
export const routing = defineRouting({
  locales: ["en", "es", "de", "tr"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  // We do our own country-based pick in middleware; next-intl's Accept-Language
  // negotiation would otherwise override it.
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  tr: "Türkçe",
};

/**
 * Country → language. A visitor from an unlisted country gets English, which is
 * the owner's rule: "if someone enters from France, default to English."
 */
/**
 * The cookie that records a DELIBERATE language choice.
 *
 * Deliberately not `NEXT_LOCALE`. next-intl writes that one on any locale-resolving
 * navigation, including a first visit that merely landed on `/en` — the canonical English
 * URL, the one in the sitemap and the one Google links to. Reading it as a choice meant a
 * visitor in Turkey arriving from an English search result never saw Turkish again, even
 * typing the bare domain (observed 2026-09-03).
 *
 * Written in exactly one place — the language switcher — and read in exactly one place: the
 * middleware's country-based pick.
 */
export const LOCALE_CHOICE_COOKIE = "DENKU_LOCALE";

export const COUNTRY_LOCALE: Record<string, Locale> = {
  TR: "tr",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es",
  EC: "es", GT: "es", CU: "es", BO: "es", DO: "es", HN: "es", PY: "es",
  SV: "es", NI: "es", CR: "es", PA: "es", UY: "es",
  DE: "de", AT: "de", LI: "de",
  // Switzerland is multilingual; German is the plurality language.
  CH: "de",
};

export function localeForCountry(country: string | null | undefined): Locale {
  if (!country) return routing.defaultLocale;
  return COUNTRY_LOCALE[country.toUpperCase()] ?? routing.defaultLocale;
}

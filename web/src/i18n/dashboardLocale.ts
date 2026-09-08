import { routing, type Locale } from "./routing";

/**
 * Which language the authenticated product speaks, given everything that claims to know.
 *
 * Pure, so the order can be pinned by tests — it is the kind of rule that looks arbitrary six
 * months later and gets "simplified" back into the bug it was written for.
 *
 * The bug: the dashboard used to read `NEXT_LOCALE`, which next-intl rewrites on any
 * locale-resolving navigation on the marketing site, including a visit to the canonical English
 * `/`. A customer who had set the product to Turkish and then clicked the logo came back to an
 * English dashboard — with their saved preference still saying `tr`, ignored because a cookie was
 * present. Observed 2026-09-07 on the owner's own workspace.
 */
export function resolveDashboardLocale(input: {
  /** `DENKU_UI_LOCALE` — written only by the dashboard language switcher. */
  chosen?: string | null;
  /** `user_metadata.ui_locale` on the session. Cross-device, and costs no round-trip. */
  account?: string | null;
  /** `profiles.ui_locale`. The same preference, for accounts saved before the metadata existed. */
  profile?: string | null;
  /** `NEXT_LOCALE`. A hint from the marketing site, and the thing the marketing site overwrites. */
  hint?: string | null;
}): Locale {
  const asLocale = (value: unknown): Locale | null =>
    routing.locales.includes(value as Locale) ? (value as Locale) : null;

  return (
    asLocale(input.chosen) ??
    asLocale(input.account) ??
    asLocale(input.profile) ??
    asLocale(input.hint) ??
    routing.defaultLocale
  );
}

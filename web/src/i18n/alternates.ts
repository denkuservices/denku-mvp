import { siteConfig } from "@/config/site";
import { routing } from "@/i18n/routing";

/**
 * What a localised page tells a search engine about itself.
 *
 * ## The two things this fixes
 *
 * **A wrong canonical is worse than none.** The root layout declared
 * `alternates: { canonical: '/' }`, and Next.js merges metadata down the tree, so every page
 * that did not override it — in every language — announced `https://www.denku.io` as its
 * canonical URL. That is not a missing signal, it is an incorrect one: it told Google the
 * Turkish pricing page IS the English home page, and the correct response to that is to drop
 * the Turkish page from the index. The site had just been translated into four languages, and
 * was asking for three of them to be ignored.
 *
 * **`hreflang` lived only in the sitemap.** `sitemap.xml` carries `alternates.languages` per
 * entry and always did. But the code comment in `[locale]/layout.tsx` justifies leaving
 * `<html lang="en">` on the grounds that "search engines take their signal from the hreflang
 * alternates in each page's metadata" — and there were none in any page's metadata. The
 * sitemap is a hint a crawler may or may not reconcile; the `<link rel="alternate">` tags in
 * the document are the direct statement, and the two together are what actually groups four
 * URLs as one page in four languages.
 *
 * ## The rules
 *
 * `localePrefix: "as-needed"` means English has no prefix, so `/about` and `/tr/about` are the
 * same page in two languages. `x-default` points at English — it is what a crawler serves to a
 * visitor whose language matches none of the four, and omitting it makes the group ambiguous.
 *
 * `path` is the UNPREFIXED route (`/about`, `""` for the home page). Passing an already
 * prefixed path would produce `/tr/tr/about`, so callers hand over what they know statically:
 * their own route.
 */

/** Absolute URL for a path in one locale. The single definition — `sitemap.ts` uses it too. */
export function localeHref(locale: string, path: string): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${siteConfig.url}${prefix}${path}`;
}

export interface LocaleAlternates {
  canonical: string;
  languages: Record<string, string>;
}

/**
 * The `alternates` block for one page in one locale.
 *
 * Canonical is absolute rather than relative on purpose: a relative canonical is resolved
 * against `metadataBase`, which has no locale, so `/about` on the Turkish page would resolve
 * back to the English URL — the exact bug this replaces, in a quieter form.
 */
export function localeAlternates(locale: string, path = ""): LocaleAlternates {
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, localeHref(l, path)])
  );
  // The page a crawler serves when it has no better match for the reader's language.
  languages["x-default"] = localeHref(routing.defaultLocale, path);

  return { canonical: localeHref(locale, path), languages };
}

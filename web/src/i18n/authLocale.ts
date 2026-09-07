import "server-only";

import { cookies } from "next/headers";
import { routing, type Locale } from "./routing";

/**
 * The language for the pages that sit outside `[locale]`.
 *
 * next-intl resolves a request's locale from the `[locale]` route segment. Auth has no such
 * segment on purpose — its URLs are `/login`, not `/tr/login`, so that Supabase's callback URLs
 * and every middleware redirect keep working — which means `getTranslations()` called there gets
 * no locale at all and quietly falls back to English. A server component on `/login` would render
 * English chrome above a form the client half of the page had already translated.
 *
 * So the locale is read here, from the same `NEXT_LOCALE` cookie the auth layout reads for the
 * client tree, and passed explicitly: `getTranslations({ locale, namespace })`. One source, both
 * halves of the page.
 */
export async function getAuthLocale(): Promise<Locale> {
  try {
    const requested = (await cookies()).get("NEXT_LOCALE")?.value;
    return routing.locales.includes(requested as Locale)
      ? (requested as Locale)
      : routing.defaultLocale;
  } catch {
    // Non-request contexts (a unit test, a build-time render) have no cookie store.
    return routing.defaultLocale;
  }
}

import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * A link to a route that lives OUTSIDE the `[locale]` tree.
 *
 * The i18n `Link` prefixes every href with the active locale, which is right for
 * marketing pages and wrong for auth: `/login` became `/tr/login`, and that route
 * does not exist, so every non-English visitor got a 404 from the nav.
 *
 * Auth is deliberately unprefixed — its URLs are baked into Supabase callbacks and
 * middleware redirects — so it needs a plain link. Using this component rather than
 * importing `next/link` directly makes the intent explicit at the call site, so the
 * next person does not "fix" it back to the localised Link.
 *
 * The destination still respects the visitor's language: the auth layout reads the
 * `NEXT_LOCALE` cookie that the marketing site set.
 */
export function ExternalToLocale(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} />;
}

export default ExternalToLocale;

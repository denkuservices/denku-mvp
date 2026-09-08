import React from "react";
import { NextIntlClientProvider } from "next-intl";
import { getAuthLocale } from "@/i18n/authLocale";

/**
 * The auth group's ground.
 *
 * Auth sits OUTSIDE the `[locale]` tree — its URLs are `/login`, not `/tr/login`,
 * because they are not SEO surfaces and prefixing them would mean rewriting every
 * redirect in the middleware and in Supabase's callback URLs. So the language is
 * taken from the `NEXT_LOCALE` cookie that the marketing site set, and the messages
 * are provided here by hand.
 *
 * Reading a cookie makes these pages dynamic instead of static. That is a fair
 * trade for two pages nobody indexes, and it means a Turkish visitor who clicks
 * "Log in" does not suddenly get English.
 *
 * The surface is declared here as well: `AuthShell` carries `.landing-surface`
 * itself, but this wrapper sits above it and would otherwise paint an unresolved
 * `--s-bg`, letting the previous page show through during navigation.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getAuthLocale();

  /*
   * Deliberately NOT `setRequestLocale`. It is next-intl's opt-in to static rendering, and these
   * pages cannot be static: /forgot-password reads `useSearchParams` with no Suspense boundary of
   * its own, so prerendering it fails the build outright. Server components here take the locale
   * explicitly instead (`getTranslations({ locale, … })`), and `AuthShell` is a client component
   * so its chrome reads the provider below rather than a request store nothing filled.
   */

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div
        lang={locale}
        className="landing-surface min-h-screen bg-[var(--s-bg)] text-[var(--s-ink)]"
      >
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

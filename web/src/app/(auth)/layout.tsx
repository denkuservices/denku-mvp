import React from "react";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";

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
  const cookieStore = await cookies();
  const requested = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;
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

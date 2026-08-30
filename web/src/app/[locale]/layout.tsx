import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The localised marketing tree.
 *
 * Note on `lang`: `<html>` lives in the single root layout, which cannot know the
 * locale without becoming dynamic — and making it dynamic would cost static
 * generation on all 89 pages. So the language is declared on this wrapper instead.
 * `lang` is valid on any element and assistive tech honours the nearest one, and
 * search engines take their signal from the `hreflang` alternates in each page's
 * metadata, which are correct. The alternative — multiple root layouts — would mean
 * restructuring auth, the dashboard and admin, which is a much larger change than
 * this buys.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Opts this subtree into static rendering (next-intl requirement).
  setRequestLocale(locale);

  return (
    <div lang={locale} className="contents">
      <NextIntlClientProvider>{children}</NextIntlClientProvider>
    </div>
  );
}

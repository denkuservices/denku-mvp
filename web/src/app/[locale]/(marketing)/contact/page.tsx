import type { Metadata } from "next";
import { setRequestLocale } from 'next-intl/server';
import { ContactPage } from '@/components/marketing/contact-page';
import { routing } from '@/i18n/routing';
import { localeAlternates } from "@/i18n/alternates";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}


/**
 * Only `alternates` — the title and description are inherited from the root layout, and this
 * page has never overridden them. What it must not inherit is a canonical: the root's used to
 * name the English home page for every locale.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, '/contact') };
}

export default async function ContactRoutePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ContactPage />;
}

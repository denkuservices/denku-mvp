import { getTranslations, setRequestLocale } from 'next-intl/server';
import { UseCasesPage } from '@/components/marketing/use-cases-page';
import { routing } from '@/i18n/routing';
import type { Metadata } from 'next';
import { localeAlternates } from '@/i18n/alternates';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'useCasesPage' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: localeAlternates(locale, '/use-cases')
  };
}

export default async function UseCasesRoutePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <UseCasesPage />;
}

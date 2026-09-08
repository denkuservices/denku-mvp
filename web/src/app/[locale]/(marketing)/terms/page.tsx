import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/marketing/Container';
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
  return { alternates: localeAlternates(locale, '/terms') };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('legalPages');
  const sections = t.raw('termsSections') as { title: string; body: string }[];

  return (
    <div className="py-16 md:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">{t('eyebrow')}</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">{t('termsTitle')}</h1>
          <p className="mt-4 text-[17px] text-[var(--s-ink-soft)]">{t('termsIntro')}</p>
          <div className="mt-10 space-y-4">
            {sections.map((item) => (
              <div key={item.title} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-2 font-display text-[17px] font-medium text-[var(--s-ink)]">{item.title}</div>
                <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}

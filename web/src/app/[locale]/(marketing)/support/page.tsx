import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { BookOpen, MessageSquare, Mail, Mic, AlertCircle, Webhook, Gauge, CreditCard } from 'lucide-react';
import { routing } from '@/i18n/routing';
import type { Metadata } from 'next';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'supportPage' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: '/support' },
  };
}

/** Icons and destinations, paired positionally with the translated path copy. */
const PATH_CHROME = [
  { icon: BookOpen, href: '/docs' },
  { icon: MessageSquare, href: '/' },
  { icon: Mail, href: '/#contact' },
];

/** Growth is the highlighted tier; the copy itself lives in the message files. */
const SLA_HIGHLIGHT = [false, true, false];

const FIX_ICONS = [Mic, AlertCircle, Webhook, Gauge, CreditCard];

export default async function SupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('supportPage');

  const paths = t.raw('paths') as { title: string; desc: string; label: string }[];
  const slaPlans = t.raw('slaPlans') as { name: string; level: string; desc: string }[];
  const fixes = t.raw('fixes') as { q: string; a: string }[];

  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-24">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">{t('eyebrow')}</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[var(--s-ink)]">
              {t('titleLead')}{' '}
              <em className="font-medium italic text-[var(--s-accent)]">{t('titleEmphasis')}</em>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[18px] text-[var(--s-ink-soft)]">{t('sub')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">{t('contactSupport')}</Link>
              <Link href="/docs" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('readDocs')}</Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Paths */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('pathsTitle')}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {paths.map((p, i) => {
              const Icon = PATH_CHROME[i].icon;
              return (
                <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="flex flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-8 text-center">
                  <div className="mx-auto mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[18px] font-medium text-[var(--s-ink)]">{p.title}</h3>
                  <p className="mb-6 mt-2 flex-1 text-sm text-[var(--s-ink-soft)]">{p.desc}</p>
                  <Link href={PATH_CHROME[i].href} className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[var(--s-border)] px-5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{p.label}</Link>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* SLA */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('slaTitle')}</h2>
          </Reveal>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
            {slaPlans.map((p, i) => {
              const highlight = SLA_HIGHLIGHT[i];
              return (
                <Reveal key={p.name} delay={(i % 3) as 0 | 1 | 2} className={`rounded-[18px] border p-6 ${highlight ? 'border-[var(--s-border)] bg-[var(--s-cta-bg)] brand-shadow-md' : 'border-[var(--s-border)] bg-[var(--s-panel-2)]'}`}>
                  <div className={`mb-1 text-sm font-bold ${highlight ? 'text-[var(--s-accent-deep)]' : 'text-[var(--s-ink-faint)]'}`}>{p.name}</div>
                  <div className={`mb-3 font-display text-[18px] font-medium ${highlight ? 'text-[var(--s-cta-fg)]' : 'text-[var(--s-ink)]'}`}>{p.level}</div>
                  <p className={`text-sm leading-relaxed ${highlight ? 'text-[var(--s-cta-fg)]' : 'text-[var(--s-ink-soft)]'}`}>{p.desc}</p>
                </Reveal>
              );
            })}
          </div>
          <p className="mt-4 text-center font-brand-mono text-xs text-[var(--s-ink-faint)]">{t('slaNote')}</p>
        </Container>
      </Section>

      {/* Common fixes */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('fixesTitle')}</h2>
            <div className="space-y-4">
              {fixes.map((fix, i) => {
                const Icon = FIX_ICONS[i];
                return (
                  <div key={fix.q} className="flex gap-4 rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                      <div className="mb-1 font-display text-[16px] font-medium text-[var(--s-ink)]">{fix.q}</div>
                      <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{fix.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </Section>

      {/* Status */}
      <Section>
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('systemStatusTitle')}</h2>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] px-4 py-2 text-sm font-medium text-[var(--s-accent-deep)]">
              <span className="h-2 w-2 rounded-full bg-[var(--s-accent)] pulse-dot" />
              {t('statusOperational')}
            </div>
            <p className="mt-4 text-sm text-[var(--s-ink-faint)]">{t('statusSoon')}</p>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('ctaTitle')}</h2>
            <p className="mb-8 text-sm text-[var(--s-ink-soft)]">{t('ctaBody')}</p>
            <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">
              {t('ctaButton')}
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}

import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import {
  BookOpen,
  CreditCard,
  Globe,
  Mail,
  MailQuestion,
  MessageSquare,
  PhoneOff,
  Send,
  Sparkles
} from 'lucide-react';
import { getSupportEmail, getSupportMailto } from '@/lib/support';
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
  const t = await getTranslations({ locale, namespace: 'supportPage' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: localeAlternates(locale, '/support')
  };
}

/** Icons and destinations, paired positionally with the translated path copy. */
const PATH_CHROME = [
  { icon: BookOpen, href: '/docs', external: false },
  { icon: Sparkles, href: '/#demo', external: false },
  { icon: Mail, href: null, external: true },
];

const FIX_ICONS = [PhoneOff, PhoneOff, Globe, MailQuestion, Send, MessageSquare, CreditCard];

/**
 * Support.
 *
 * Rewritten 2026-09-07. What was here promised a three-tier response table ending in a
 * "Contractual SLA · Guaranteed response times and escalation paths defined in contract", plus
 * "Community support" on Starter — there is no contract tier, no community, and no status page
 * behind the "coming soon" that sat under it. The troubleshooting was for a product with
 * customer-configurable webhooks, which this one does not have.
 *
 * What replaces it is deliberately smaller: three ways to reach us, an honest paragraph about
 * what we can and cannot promise, and fixes for the things that actually go wrong — every one of
 * them drawn from a real failure mode in this repo (carrier number propagation, SIP number
 * format, the web-chat origin allowlist, email forwarding bringing no history, a chat channel
 * with no plan or no employee, an empty Knowledge section).
 */
export default async function SupportPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('supportPage');

  const paths = t.raw('paths') as { title: string; desc: string; label: string }[];
  const fixes = t.raw('fixes') as { q: string; a: string }[];
  const mailto = getSupportMailto('Denku support');

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
              <a href={mailto} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">{t('contactSupport')}</a>
              <Link href="/docs" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('readDocs')}</Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Three ways */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('pathsTitle')}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {paths.map((p, i) => {
              const chrome = PATH_CHROME[i];
              const Icon = chrome.icon;
              const buttonClass = "inline-flex h-10 items-center justify-center rounded-[10px] border border-[var(--s-border)] px-5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]";
              return (
                <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="flex flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-8 text-center">
                  <div className="mx-auto mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[18px] font-medium text-[var(--s-ink)]">{p.title}</h3>
                  <p className="mb-6 mt-2 flex-1 text-sm text-[var(--s-ink-soft)]">{p.desc}</p>
                  {chrome.href ? (
                    <Link href={chrome.href} className={buttonClass}>{p.label}</Link>
                  ) : (
                    <a href={mailto} className={buttonClass}>{p.label}</a>
                  )}
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* How we answer — the honest paragraph that replaced the SLA table */}
      <Section>
        <Container>
          <Reveal className="mx-auto max-w-3xl rounded-[20px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-8 md:p-10">
            <h2 className="font-display text-[26px] font-normal tracking-[-0.5px] text-[var(--s-ink)]">{t('answerTitle')}</h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--s-ink-soft)]">{t('answerBody')}</p>
            <p className="mt-4 border-t border-[var(--s-border)] pt-4 text-sm leading-relaxed text-[var(--s-ink-faint)]">{t('answerHonesty')}</p>
            <p className="mt-6 font-brand-mono text-xs text-[var(--s-ink-faint)]">{getSupportEmail()}</p>
          </Reveal>
        </Container>
      </Section>

      {/* Common fixes */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('fixesTitle')}</h2>
            <div className="space-y-4">
              {fixes.map((fix, i) => {
                const Icon = FIX_ICONS[i] ?? MessageSquare;
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
            <h2 className="mb-4 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('statusTitle')}</h2>
            <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{t('statusBody')}</p>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('ctaTitle')}</h2>
            <p className="mb-8 text-sm text-[var(--s-ink-soft)]">{t('ctaBody')}</p>
            <a href={mailto} className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">
              {t('ctaButton')}
            </a>
          </div>
        </Container>
      </Section>
    </>
  );
}

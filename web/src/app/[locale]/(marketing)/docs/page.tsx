import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import {
  BookOpen,
  Boxes,
  CalendarClock,
  Clock,
  Ear,
  Image as ImageIcon,
  MessageSquare,
  UserRound
} from 'lucide-react';
import { MARKETING_CHANNELS, STATUS_ORDER } from '@/lib/marketing/content/channels';
import { LANGUAGE_CODES } from '@/lib/language/registry';
import { getSupportMailto } from '@/lib/support';
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
  const t = await getTranslations({ locale, namespace: 'docsPage' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: localeAlternates(locale, '/docs')
  };
}

/** Numbers, not copy — the step badges read the same in every language. */
const STEP_NUMBERS = ['01', '02', '03', '04'];

/** Icons, not copy. Paired positionally with the translated lists. */
const OUTPUT_ICONS = [MessageSquare, UserRound, BookOpen, CalendarClock];
const SENSE_ICONS = [ImageIcon, Ear, Boxes];

/**
 * How Denku works.
 *
 * Rewritten 2026-09-07. What was here before was pre-V3 copy that promised Zendesk, Intercom,
 * Salesforce, HubSpot and Calendly integrations, "full API access on Scale plans", custom model
 * configurations, and a webhook section instructing customers to verify HMAC signatures on
 * endpoints they cannot configure — the only webhook URL in the product is inbound, read-only,
 * and provisioned automatically. None of it existed, and the language sweep had just translated
 * all of it into three more languages.
 *
 * Every claim below is checkable against something in this repo: the channel roster comes from
 * `lib/marketing/content/channels.ts`, the language list from the language registry, and the
 * behaviour statements from `lib/denku-agent/corpus.ts` — the same facts the assistant on this
 * site answers prospects from. If the product changes, those change, and this page follows.
 */
export default async function DocsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docsPage');
  const tc = await getTranslations('channels');

  const steps = t.raw('steps') as { title: string; description: string }[];
  const outputs = t.raw('outputs') as { title: string; description: string }[];
  const knowledge = t.raw('knowledgePoints') as { title: string; description: string }[];
  const senses = t.raw('senses') as { title: string; description: string }[];
  const faqs = t.raw('faqs') as { question: string; answer: string }[];

  const channels = [...MARKETING_CHANNELS].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  // The same three tones `ChannelGrid` uses — the marketing surface is dark, so the literal
  // cream that was here read as a light chip in a row of dark ones.
  const statusTone: Record<string, string> = {
    live: 'border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]',
    limited: 'border-[rgba(200,148,104,.30)] bg-[rgba(200,148,104,.10)] text-[var(--d-copper)]',
    beta: 'border-[var(--s-border)] bg-[var(--s-panel-2)] text-[var(--s-ink-faint)]'
  };

  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-20">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">{t('eyebrow')}</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">{t('title')}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-[18px] text-[var(--s-ink-soft)]">{t('sub')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">{t('getStarted')}</Link>
              <Link href="/#demo" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('talkToDenku')}</Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Getting started */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('gettingStartedTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('gettingStartedSub')}</p>
          </Reveal>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <Reveal key={STEP_NUMBERS[i]} delay={(i % 4) as 0 | 1 | 2 | 3} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--s-accent-ring)] font-display text-[15px] font-medium text-[var(--s-accent)]">{STEP_NUMBERS[i]}</div>
                <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{step.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Where it answers — the roster and its badges come from the marketing channel module,
          so this page can never claim a channel the site has not agreed is live. */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('channelsTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('channelsSub')}</p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {channels.map((channel, i) => (
              <Reveal key={channel.id} delay={(i % 4) as 0 | 1 | 2 | 3} className="flex h-full flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">
                    {tc(`items.${channel.id}.label`)}
                  </h3>
                  <span className={`shrink-0 rounded-full border px-2 py-[3px] font-brand-mono text-[8.5px] uppercase tracking-[.14em] ${statusTone[channel.status]}`}>
                    {tc(`status.${channel.status}`)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">
                  {tc(`items.${channel.id}.line`)}
                </p>
                {channel.caveat ? (
                  <p className="mt-3 border-t border-[var(--s-border)] pt-3 text-xs leading-relaxed text-[var(--s-ink-faint)]">
                    {tc(`items.${channel.id}.caveat`)}
                  </p>
                ) : null}
              </Reveal>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--s-ink-faint)]">{t('channelsNote')}</p>
        </Container>
      </Section>

      {/* What you get */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('outputTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('outputSub')}</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {outputs.map((item, i) => {
              const Icon = OUTPUT_ICONS[i];
              return (
                <Reveal key={item.title} delay={(i % 2) as 0 | 1} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6">
                  <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                    <Icon className="h-[20px] w-[20px]" />
                  </div>
                  <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{item.description}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Knowledge */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('knowledgeTitle')}</h2>
            <p className="mx-auto mt-3 max-w-3xl text-sm text-[var(--s-ink-soft)]">{t('knowledgeSub')}</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {knowledge.map((item, i) => (
              <Reveal key={item.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{item.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Languages + senses */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="grid gap-4 lg:grid-cols-2">
            <Reveal className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6 md:p-8">
              <h2 className="font-display text-[24px] font-normal tracking-[-0.5px] text-[var(--s-ink)]">{t('languagesTitle')}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--s-ink-soft)]">{t('languagesSub')}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {/* Driven by the registry: a fifth language shows up here the day it is added. */}
                {LANGUAGE_CODES.map((code) => (
                  <span key={code} className="rounded-full border border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--s-accent-deep)]">
                    {t(`languageNames.${code}`)}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-xs leading-relaxed text-[var(--s-ink-faint)]">{t('languagesNote')}</p>
            </Reveal>

            <Reveal delay={1} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6 md:p-8">
              <h2 className="font-display text-[24px] font-normal tracking-[-0.5px] text-[var(--s-ink)]">{t('sensesTitle')}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--s-ink-soft)]">{t('sensesSub')}</p>
              <ul className="mt-5 space-y-4">
                {senses.map((item, i) => {
                  const Icon = SENSE_ICONS[i];
                  return (
                    <li key={item.title} className="flex gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-[var(--s-ink)]">{item.title}</span>
                        <span className="mt-0.5 block text-sm leading-relaxed text-[var(--s-ink-soft)]">{item.description}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* Takeover, hours, store — the three things people assume wrongly */}
      <Section>
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { title: t('takeoverTitle'), body: t('takeoverBody'), caveat: t('takeoverCaveat'), Icon: UserRound },
              { title: t('hoursTitle'), body: t('hoursBody'), caveat: t('hoursCaveat'), Icon: Clock },
              { title: t('storeTitle'), body: t('storeBody'), caveat: t('storeCaveat'), Icon: Boxes },
            ].map((card, i) => (
              <Reveal key={card.title} delay={(i % 3) as 0 | 1 | 2} className="flex h-full flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <div className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-[12px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                  <card.Icon className="h-[20px] w-[20px]" />
                </div>
                <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{card.body}</p>
                <p className="mt-4 border-t border-[var(--s-border)] pt-3 text-xs leading-relaxed text-[var(--s-ink-faint)]">{card.caveat}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('faqTitle')}</h2>
            <div className="space-y-6">
              {faqs.map((faq) => (
                <div key={faq.question} className="border-b border-[var(--s-border)] pb-6">
                  <h3 className="mb-2 font-display text-[17px] font-medium text-[var(--s-ink)]">{faq.question}</h3>
                  <p className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('ctaTitle')}</h2>
            <p className="mb-8 text-sm text-[var(--s-ink-soft)]">{t('ctaBody')}</p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#demo" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">{t('ctaTalk')}</Link>
              <a href={getSupportMailto('Denku — a question about the docs')} className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('ctaSupport')}</a>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

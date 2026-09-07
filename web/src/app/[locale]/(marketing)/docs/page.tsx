import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { Code, Webhook, Zap } from 'lucide-react';
import { SITE_NAME } from '@/config/site';
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
  const t = await getTranslations({ locale, namespace: 'docsPage' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription', { name: SITE_NAME }),
    alternates: { canonical: '/docs' },
  };
}

/** Numbers, not copy — the step badges read the same in every language. */
const STEP_NUMBERS = ['01', '02', '03', '04'];

/** Icons, not copy. Paired positionally with the translated integration examples. */
const INTEGRATION_ICONS = [Webhook, Zap, Code];

export default async function DocsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('docsPage');

  const steps = t.raw('steps') as { title: string; description: string }[];
  const concepts = t.raw('concepts') as { title: string; description: string }[];
  const integrations = t.raw('integrations') as { title: string; description: string }[];
  const faqs = t.raw('faqs') as { question: string; answer: string }[];

  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-20">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">{t('eyebrow')}</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">{t('title')}</h1>
            <p className="mx-auto mt-4 max-w-xl text-[18px] text-[var(--s-ink-soft)]">{t('sub')}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]">{t('getStarted')}</Link>
              <Link href="/" className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('talkToDenku')}</Link>
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

      {/* Core concepts */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('conceptsTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('conceptsSub', { name: SITE_NAME })}</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {concepts.map((concept, i) => (
              <Reveal key={concept.title} delay={(i % 2) as 0 | 1} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
                <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{concept.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{concept.description}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Webhooks */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <Reveal className="mb-8 text-center">
              <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('webhooksTitle')}</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('webhooksSub')}</p>
            </Reveal>
            <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6">
              <p className="mb-4 text-sm text-[var(--s-ink-soft)]">{t('webhooksBody')}</p>
              <div className="rounded-[12px] border border-[var(--s-border)] bg-[var(--s-cta-bg)] p-4">
                <pre className="overflow-x-auto font-brand-mono text-xs text-[var(--s-cta-fg)]">
                  <code>{`// Verify webhook signature (example)
const signature = request.headers['x-signature'];
const payload = request.body;
const secret = process.env.WEBHOOK_SECRET;

const expected = hmacSHA256(payload, secret);
if (signature !== expected) {
  return 401; // Invalid signature
}`}</code>
                </pre>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Integration examples */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('integrationsTitle')}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--s-ink-soft)]">{t('integrationsSub')}</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {integrations.map((example, i) => {
              const Icon = INTEGRATION_ICONS[i];
              return (
                <Reveal key={example.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6 transition-all hover:-translate-y-1 hover:brand-shadow-md">
                  <div className="mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{example.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{example.description}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="border-t border-[var(--s-border)]">
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
    </>
  );
}

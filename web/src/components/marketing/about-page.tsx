import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { SITE_NAME } from '@/config/site';

export async function AboutPage() {
  const t = await getTranslations('aboutPage');
  const pillars = t.raw('pillars') as { title: string; desc: string }[];
  const principles = t.raw('principles') as string[];

  return (
    <Section className="py-16 md:py-20">
      <Container>
        <Reveal className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">{t('eyebrow')}</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[var(--s-ink)]">
            {t('title', { name: SITE_NAME })}
          </h1>
          <p className="mt-4 text-[18px] leading-relaxed text-[var(--s-ink-soft)]">
            {t('intro', { name: SITE_NAME })}
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-[20px] border border-[var(--s-border)] bg-[var(--s-cta-bg)] p-8 md:p-10 brand-shadow-lg">
          <div className="brand-eyebrow mb-3 !text-[var(--s-accent-deep)] before:!bg-[var(--s-accent)]">{t('missionEyebrow')}</div>
          <div className="font-display text-[26px] font-normal tracking-[-0.5px] text-[var(--s-cta-fg)]">{t('missionTitle')}</div>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--s-cta-fg)]">
            {t('missionBody')}
          </p>
        </Reveal>

        <div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
              <div className="mb-2 font-display text-[17px] font-medium text-[var(--s-ink)]">{p.title}</div>
              <p className="text-sm text-[var(--s-ink-soft)]">{p.desc}</p>
            </Reveal>
          ))}
        </div>

        <div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-2">
          <Reveal className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
            <div className="mb-4 font-display text-[17px] font-medium text-[var(--s-ink)]">{t('principlesTitle')}</div>
            <ul className="space-y-2">
              {principles.map((x) => (
                <li key={x} className="flex items-start gap-2.5 text-sm text-[var(--s-ink-soft)]">
                  <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--s-accent)]" />
                  {x}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={1} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6">
            <div className="mb-3 font-display text-[17px] font-medium text-[var(--s-ink)]">{t('whatYouGetTitle')}</div>
            <p className="mb-6 text-sm text-[var(--s-ink-soft)]">
              {t('whatYouGetBody')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/pricing" className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[var(--s-border)] px-4 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]">{t('viewPricing')}</Link>
              <Link href="/contact" className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--s-cta-bg)] px-4 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:bg-[var(--s-accent)]">{t('talkToUs')}</Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

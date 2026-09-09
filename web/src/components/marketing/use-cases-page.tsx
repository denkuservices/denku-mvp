'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Container } from './Container';
import { Section } from './Section';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
  Inbox,
  MessageSquare,
  Mic,
  PhoneMissed,
  PhoneCall,
  Send,
  UserRound,
} from 'lucide-react';
import { ExternalToLocale } from '@/components/marketing/ExternalToLocale';

type UseCase = 'missed-calls' | 'booking' | 'questions' | 'messages';

type UseCaseCopy = {
  title: string;
  description: string;
  flow: string[];
  bullets: string[];
  notYet: string[];
};

/**
 * What people hand over to the AI first.
 *
 * Rewritten 2026-09-08. What was here before was pre-V3 copy written against a product
 * roadmap rather than a product: it promised the AI would check a CRM or helpdesk mid-call,
 * score leads and route them to the right team, push them to a CRM "via webhook/tool", check
 * calendar availability in real time, reschedule appointments, send reminders, look up order
 * status and send proactive notifications. None of that is built. Two of them are refused on
 * purpose — order lookup, because an anonymous caller must never be able to read a stranger's
 * order, and a mid-call transfer, because the AI cannot hand a live caller to a person.
 *
 * The replacement is organised the way `/employees` is: what it does, and — in the same card,
 * not a footnote — what it does NOT do yet. A prospect who reads the second list and buys
 * anyway is a customer who stays. The four workflows below are the four things the shipped
 * pipeline actually performs, and every claim is checkable against `lib/denku-agent/corpus.ts`,
 * which is what the assistant on this site answers prospects from.
 *
 * Icons and ordering live here; every word lives in the message files. The flow icons pair
 * positionally with the four translated flow steps.
 */
const CASE_CHROME: { id: UseCase; icon: typeof PhoneCall; flowIcons: (typeof PhoneCall)[] }[] = [
  {
    id: 'missed-calls',
    icon: PhoneMissed,
    flowIcons: [PhoneCall, MessageSquare, FileText, Inbox],
  },
  {
    id: 'booking',
    icon: CalendarClock,
    flowIcons: [PhoneCall, MessageSquare, CalendarClock, CheckCircle2],
  },
  {
    id: 'questions',
    icon: BookOpen,
    flowIcons: [MessageSquare, BookOpen, UserRound, Inbox],
  },
  {
    id: 'messages',
    icon: Send,
    flowIcons: [MessageSquare, BookOpen, Send, Inbox],
  },
];

export function UseCasesPage() {
  const t = useTranslations('useCasesPage');
  const [activeUseCase, setActiveUseCase] = useState<UseCase>('missed-calls');
  const cases = t.raw('cases') as Record<UseCase, UseCaseCopy>;
  const activeChrome = CASE_CHROME.find((c) => c.id === activeUseCase) ?? CASE_CHROME[0];
  const activeData = cases[activeChrome.id];

  return (
    <>
      {/* Hero + the four workflows */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="mb-12 text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">{t('eyebrow')}</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal leading-[1.06] tracking-[-1.5px] text-[var(--s-ink)]">
              {t('titleLead')} <em className="font-medium italic text-[var(--s-accent)]">{t('titleEmphasis')}</em>?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] text-[var(--s-ink-soft)]">{t('sub')}</p>
          </div>

          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            {CASE_CHROME.map((chrome) => {
              const useCase = cases[chrome.id];
              const Icon = chrome.icon;
              const isActive = activeUseCase === chrome.id;
              return (
                <button
                  key={chrome.id}
                  type="button"
                  onClick={() => setActiveUseCase(chrome.id)}
                  aria-pressed={isActive}
                  className={`group relative rounded-[18px] border p-6 text-left transition-all ${
                    isActive
                      ? 'border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] brand-shadow-sm'
                      : 'border-[var(--s-border)] bg-[var(--s-panel-2)] hover:border-[var(--s-border)]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors ${isActive ? 'bg-[var(--s-panel)] text-[var(--s-accent-deep)]' : 'bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{useCase.title}</h2>
                      <p className="mt-0.5 text-sm text-[var(--s-ink-faint)]">{useCase.description}</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center gap-2 text-sm font-medium transition-opacity ${isActive ? 'text-[var(--s-accent)] opacity-100' : 'text-[var(--s-ink-faint)] opacity-0 group-hover:opacity-100'}`}>
                    <span>{t('viewFlow')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* The flow, what it does, and what it does not do — the third block is the point */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
            <div className="lg:col-span-2">
              <h2 className="mb-8 font-display text-[clamp(24px,3vw,36px)] font-normal tracking-[-0.8px] text-[var(--s-ink)]">{t('howItWorks')}</h2>
              <div className="relative space-y-0">
                {activeData.flow.map((step, index) => {
                  const StepIcon = activeChrome.flowIcons[index];
                  const isLast = index === activeData.flow.length - 1;
                  const isFirst = index === 0;
                  return (
                    <div key={step} className="relative pb-8">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-[14px] border-2 transition-all ${isFirst ? 'border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]' : 'border-[var(--s-border)] bg-[var(--s-bg)] text-[var(--s-ink-faint)]'}`}>
                            <StepIcon className="h-6 w-6" />
                          </div>
                          {isFirst && <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--s-accent)] pulse-dot" />}
                        </div>
                        <div className={`text-base font-medium ${isFirst ? 'text-[var(--s-ink)]' : 'text-[var(--s-ink-soft)]'}`}>{step}</div>
                      </div>
                      {!isLast && (
                        <div className="absolute left-7 top-14 ml-[1px] h-16 w-0.5 border-l border-dashed border-[var(--s-border)]">
                          <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--s-accent)]" style={{ animation: 'flowConnectorVertical 2s ease-in-out infinite' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-4">
                <div className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6">
                  <h3 className="mb-4 font-display text-[16px] font-medium text-[var(--s-ink)]">{t('whatItDoes')}</h3>
                  <ul className="space-y-3">
                    {activeData.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--s-accent)]" />
                        <span className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Deliberately as prominent as the list above it. Copper rather than the teal
                    accent so the eye separates the two lists, and drawn from the theme tokens —
                    the marketing surface remaps `--s-*` to the dark V3 palette, so a literal
                    warm hex here would be a cream slab on a near-black page. */}
                <div className="rounded-[18px] border border-[rgba(200,148,104,.35)] bg-[rgba(200,148,104,.08)] p-6">
                  <h3 className="mb-4 font-display text-[16px] font-medium text-[var(--d-copper)]">{t('whatItDoesNot')}</h3>
                  <ul className="space-y-3">
                    {activeData.notYet.map((line) => (
                      <li key={line} className="flex items-start gap-3">
                        <span aria-hidden="true" className="mt-[9px] h-[2px] w-4 shrink-0 rounded-full bg-[var(--d-copper)]" />
                        <span className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Two ways to keep reading, instead of a dead end */}
      <Section>
        <Container>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
            <Link href="/industries" className="group flex flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6 transition-all hover:border-[var(--s-accent)]">
              <h2 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{t('byTradeTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{t('byTradeBody')}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--s-accent)]">
                {t('byTradeLink')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
            <Link href="/employees" className="group flex flex-col rounded-[18px] border border-[var(--s-border)] bg-[var(--s-panel-2)] p-6 transition-all hover:border-[var(--s-accent)]">
              <h2 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{t('byEmployeeTitle')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--s-ink-soft)]">{t('byEmployeeBody')}</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--s-accent)]">
                {t('byEmployeeLink')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-24">
        <Container>
          {/*
            The page ground, not a slab.

            This block used to be a filled card: `bg-[var(--s-cta-bg)]` across the whole panel with
            the buttons styled for a dark surface. That token is a BUTTON colour — dark navy in the
            warm theme, and remapped to copper `#C89468` on the marketing surface — so on the dark
            site it painted a large copper plate in the middle of a near-black page, and the two
            controls inside it stopped working as controls: the primary was white-on-teal at
            **3.08:1** (WCAG AA wants 4.5 for body text, and this is the page's main action), and
            the secondary's `--s-border` hairline is a 10%-alpha near-white written for a dark
            ground, which over copper is invisible — it read as bare text.

            Measured on production 2026-09-09. The fix is not new styling: it is the CTA `/docs`
            and `/support` already ship. Copper becomes the primary BUTTON against the page ground
            (dark text on copper = 7.03:1), and the secondary keeps the hairline that was designed
            for that ground.
          */}
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-ink)]">{t('ctaTitle')}</h2>
            <p className="mx-auto mb-8 max-w-xl text-[17px] text-[var(--s-ink-soft)]">{t('ctaBody')}</p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              {/* The old button scrolled to `#product`, an anchor that lives on the pre-V3 hero
                  and is not on the page any more — it silently did nothing. `#demo` is the
                  live demo section on the current landing page. */}
              <Link href="/#demo" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)] sm:w-auto">
                <Mic className="h-4 w-4" />
                {t('ctaTalk')}
              </Link>
              <ExternalToLocale href="/signup" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)] sm:w-auto">
                {t('ctaStart')}
              </ExternalToLocale>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

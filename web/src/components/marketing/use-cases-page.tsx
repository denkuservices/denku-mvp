'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Headphones, Phone, Calendar, Package, ArrowRight, CheckCircle2, Database, MessageSquare, Mic } from 'lucide-react';

type UseCase = 'support' | 'sales' | 'appointment' | 'order-status';

const useCases = [
  {
    id: 'support' as UseCase,
    title: 'Customer Support',
    description: 'Reduce ticket volume and improve response time.',
    icon: Headphones,
    flow: [
      { label: 'Incoming call', icon: Phone },
      { label: 'AI answers instantly', icon: MessageSquare },
      { label: 'Checks system (CRM / Helpdesk)', icon: Database },
      { label: 'Resolves or escalates', icon: CheckCircle2 },
    ],
    bullets: ['Answers FAQs and product questions instantly', 'Creates tickets with structured payloads', 'Escalates to humans with full context'],
  },
  {
    id: 'sales' as UseCase,
    title: 'Sales Intake',
    description: 'Capture and route leads with structured intake.',
    icon: Phone,
    flow: [
      { label: 'Incoming lead call', icon: Phone },
      { label: 'AI qualifies instantly', icon: MessageSquare },
      { label: 'Scores and routes', icon: Database },
      { label: 'Pushes to CRM', icon: CheckCircle2 },
    ],
    bullets: ['Asks qualifying questions automatically', 'Scores and routes leads to the right team', 'Pushes to CRM via webhook/tool'],
  },
  {
    id: 'appointment' as UseCase,
    title: 'Appointment Booking',
    description: 'Book, reschedule, and confirm through voice or chat.',
    icon: Calendar,
    flow: [
      { label: 'Customer requests booking', icon: Phone },
      { label: 'AI checks availability', icon: Database },
      { label: 'Books or suggests times', icon: Calendar },
      { label: 'Sends confirmation', icon: CheckCircle2 },
    ],
    bullets: ['Checks calendar availability in real-time', 'Books or reschedules appointments', 'Sends confirmations and reminders'],
  },
  {
    id: 'order-status' as UseCase,
    title: 'Order Status & Updates',
    description: 'Automate "where is my order?" and status requests.',
    icon: Package,
    flow: [
      { label: 'Customer asks for status', icon: Phone },
      { label: 'AI checks order system', icon: Database },
      { label: 'Provides update instantly', icon: MessageSquare },
      { label: 'Proactive notifications', icon: CheckCircle2 },
    ],
    bullets: ['Checks order status via tool/webhook', 'Provides proactive updates when needed', 'Deflects repetitive inbound queries'],
  },
];

export function UseCasesPage() {
  const [activeUseCase, setActiveUseCase] = useState<UseCase>('support');
  const activeData = useCases.find((uc) => uc.id === activeUseCase) || useCases[0];

  const scrollToHero = (e: React.MouseEvent) => {
    e.preventDefault();
    document.querySelector('#product')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="mb-12 text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Use cases</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal leading-[1.06] tracking-[-1.5px] text-[var(--s-ink)]">
              What do you want your AI employee to <em className="font-medium italic text-[var(--s-accent)]">handle</em>?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] text-[var(--s-ink-soft)]">Pick a workflow. See how it works in production.</p>
          </div>

          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              const isActive = activeUseCase === useCase.id;
              return (
                <button
                  key={useCase.id}
                  onClick={() => setActiveUseCase(useCase.id)}
                  className={`group relative rounded-[18px] border p-6 text-left transition-all ${
                    isActive ? 'border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] brand-shadow-sm' : 'border-[var(--s-border)] bg-[var(--s-panel-2)] hover:border-[var(--s-border)]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors ${isActive ? 'bg-[var(--s-panel)] text-[var(--s-accent-deep)]' : 'bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-[17px] font-medium text-[var(--s-ink)]">{useCase.title}</h3>
                      <p className="mt-0.5 text-sm text-[var(--s-ink-faint)]">{useCase.description}</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center gap-2 text-sm font-medium transition-opacity ${isActive ? 'text-[var(--s-accent)] opacity-100' : 'text-[var(--s-ink-faint)] opacity-0 group-hover:opacity-100'}`}>
                    <span>View flow</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Flow */}
      <Section className="border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
        <Container>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
            <div className="lg:col-span-2">
              <h2 className="mb-8 font-display text-[clamp(24px,3vw,36px)] font-normal tracking-[-0.8px] text-[var(--s-ink)]">How it works</h2>
              <div className="relative space-y-0">
                {activeData.flow.map((step, index) => {
                  const StepIcon = step.icon;
                  const isLast = index === activeData.flow.length - 1;
                  const isFirst = index === 0;
                  return (
                    <div key={index} className="relative pb-8">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-[14px] border-2 transition-all ${isFirst ? 'border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]' : 'border-[var(--s-border)] bg-[var(--s-bg)] text-[var(--s-ink-faint)]'}`}>
                            <StepIcon className="h-6 w-6" />
                          </div>
                          {isFirst && <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[var(--s-accent)] pulse-dot" />}
                        </div>
                        <div className={`text-base font-medium ${isFirst ? 'text-[var(--s-ink)]' : 'text-[var(--s-ink-soft)]'}`}>{step.label}</div>
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
              <div className="sticky top-24 rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6">
                <h3 className="mb-4 font-display text-[16px] font-medium text-[var(--s-ink)]">What the agent does</h3>
                <ul className="space-y-3">
                  {activeData.bullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--s-accent)]" />
                      <span className="text-sm leading-relaxed text-[var(--s-ink-soft)]">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="mx-auto max-w-3xl overflow-hidden rounded-[24px] border border-[var(--s-border)] bg-[var(--s-cta-bg)] p-8 text-center md:p-12 brand-shadow-lg">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[var(--s-cta-fg)]">Want to see this live?</h2>
            <p className="mx-auto mb-8 max-w-xl text-[17px] text-[var(--s-cta-fg)]">Try the live voice agent now, then we&apos;ll help you set up your own workflow.</p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={scrollToHero} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--s-accent)] px-6 text-sm font-medium text-white transition-all hover:bg-[var(--s-accent)] sm:w-auto">
                <Mic className="h-4 w-4" />
                Talk to Denku
              </button>
              <Link href="/signup" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:border-[var(--s-border)] sm:w-auto">
                Get started
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

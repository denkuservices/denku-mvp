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
            <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
              What do you want your AI employee to <em className="font-medium italic text-[#1B6E6E]">handle</em>?
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[18px] text-[#2C3E54]">Pick a workflow. See how it works in production.</p>
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
                    isActive ? 'border-[#1B6E6E]/40 bg-[#E3EEED] brand-shadow-sm' : 'border-[#0A1A2F]/[0.06] bg-[#FBFAF8] hover:border-[#0A1A2F]/15'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition-colors ${isActive ? 'bg-white text-[#134F4F]' : 'bg-[#E3EEED] text-[#134F4F]'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">{useCase.title}</h3>
                      <p className="mt-0.5 text-sm text-[#6B7888]">{useCase.description}</p>
                    </div>
                  </div>
                  <div className={`mt-4 flex items-center gap-2 text-sm font-medium transition-opacity ${isActive ? 'text-[#1B6E6E] opacity-100' : 'text-[#6B7888] opacity-0 group-hover:opacity-100'}`}>
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
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
            <div className="lg:col-span-2">
              <h2 className="mb-8 font-display text-[clamp(24px,3vw,36px)] font-normal tracking-[-0.8px] text-[#0A1A2F]">How it works</h2>
              <div className="relative space-y-0">
                {activeData.flow.map((step, index) => {
                  const StepIcon = step.icon;
                  const isLast = index === activeData.flow.length - 1;
                  const isFirst = index === 0;
                  return (
                    <div key={index} className="relative pb-8">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-[14px] border-2 transition-all ${isFirst ? 'border-[#1B6E6E]/50 bg-[#E3EEED] text-[#134F4F]' : 'border-[#0A1A2F]/[0.08] bg-[#F7F5F1] text-[#6B7888]'}`}>
                            <StepIcon className="h-6 w-6" />
                          </div>
                          {isFirst && <div className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#1B6E6E] pulse-dot" />}
                        </div>
                        <div className={`text-base font-medium ${isFirst ? 'text-[#0A1A2F]' : 'text-[#2C3E54]'}`}>{step.label}</div>
                      </div>
                      {!isLast && (
                        <div className="absolute left-7 top-14 ml-[1px] h-16 w-0.5 border-l border-dashed border-[#0A1A2F]/15">
                          <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[#1B6E6E]" style={{ animation: 'flowConnectorVertical 2s ease-in-out infinite' }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="sticky top-24 rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-6">
                <h3 className="mb-4 font-display text-[16px] font-medium text-[#0A1A2F]">What the agent does</h3>
                <ul className="space-y-3">
                  {activeData.bullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1B6E6E]" />
                      <span className="text-sm leading-relaxed text-[#2C3E54]">{bullet}</span>
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
          <div className="mx-auto max-w-3xl overflow-hidden rounded-[24px] border border-[#0A1A2F] bg-[#0A1A2F] p-8 text-center md:p-12 brand-shadow-lg">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#F7F5F1]">Want to see this live?</h2>
            <p className="mx-auto mb-8 max-w-xl text-[17px] text-[#F7F5F1]/70">Try the live voice agent now, then we&apos;ll help you set up your own workflow.</p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button onClick={scrollToHero} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#1B6E6E] px-6 text-sm font-medium text-white transition-all hover:bg-[#228585] sm:w-auto">
                <Mic className="h-4 w-4" />
                Talk to Denku
              </button>
              <Link href="/signup" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#F7F5F1]/25 px-6 text-sm font-medium text-[#F7F5F1] transition-all hover:border-[#F7F5F1]/50 sm:w-auto">
                Get started
              </Link>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

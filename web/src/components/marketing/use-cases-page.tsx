'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Button } from './Button';
import {
  Headphones,
  Phone,
  Calendar,
  Package,
  ArrowRight,
  CheckCircle2,
  Database,
  MessageSquare,
  Mic,
} from 'lucide-react';

type UseCase = 'support' | 'sales' | 'appointment' | 'order-status';

interface UseCaseData {
  id: UseCase;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  flow: FlowStep[];
  bullets: string[];
}

interface FlowStep {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const useCases: UseCaseData[] = [
  {
    id: 'support',
    title: 'Customer Support',
    description: 'Reduce ticket volume and improve response time.',
    icon: Headphones,
    flow: [
      { label: 'Incoming call', icon: Phone },
      { label: 'AI answers instantly', icon: MessageSquare },
      { label: 'Checks system (CRM / Helpdesk)', icon: Database },
      { label: 'Resolves or escalates', icon: CheckCircle2 },
    ],
    bullets: [
      'Answers FAQs and product questions instantly',
      'Creates tickets with structured payloads',
      'Escalates to humans with full context',
    ],
  },
  {
    id: 'sales',
    title: 'Sales Intake',
    description: 'Capture and route leads with structured intake.',
    icon: Phone,
    flow: [
      { label: 'Incoming lead call', icon: Phone },
      { label: 'AI qualifies instantly', icon: MessageSquare },
      { label: 'Scores and routes', icon: Database },
      { label: 'Pushes to CRM', icon: CheckCircle2 },
    ],
    bullets: [
      'Asks qualifying questions automatically',
      'Scores and routes leads to the right team',
      'Pushes to CRM via webhook/tool',
    ],
  },
  {
    id: 'appointment',
    title: 'Appointment Booking',
    description: 'Book, reschedule, and confirm through voice or chat.',
    icon: Calendar,
    flow: [
      { label: 'Customer requests booking', icon: Phone },
      { label: 'AI checks availability', icon: Database },
      { label: 'Books or suggests times', icon: Calendar },
      { label: 'Sends confirmation', icon: CheckCircle2 },
    ],
    bullets: [
      'Checks calendar availability in real-time',
      'Books or reschedules appointments',
      'Sends confirmations and reminders',
    ],
  },
  {
    id: 'order-status',
    title: 'Order Status & Updates',
    description: 'Automate "where is my order?" and status requests.',
    icon: Package,
    flow: [
      { label: 'Customer asks for status', icon: Phone },
      { label: 'AI checks order system', icon: Database },
      { label: 'Provides update instantly', icon: MessageSquare },
      { label: 'Proactive notifications', icon: CheckCircle2 },
    ],
    bullets: [
      'Checks order status via tool/webhook',
      'Provides proactive updates when needed',
      'Deflects repetitive inbound queries',
    ],
  },
];

export function UseCasesPage() {
  const [activeUseCase, setActiveUseCase] = useState<UseCase>('support');
  const activeData = useCases.find((uc) => uc.id === activeUseCase) || useCases[0];

  const scrollToHero = (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.querySelector('#product');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <>
      {/* Hero Section */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-[#0F172A] md:text-4xl lg:text-5xl mb-4">
              What do you want your AI agent to handle?
            </h1>
            <p className="text-base text-[#475569] md:text-lg max-w-2xl mx-auto">
              Pick a workflow. See how it works in production.
            </p>
          </div>

          {/* 4 Large Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {useCases.map((useCase) => {
              const Icon = useCase.icon;
              const isActive = activeUseCase === useCase.id;

              return (
                <button
                  key={useCase.id}
                  onClick={() => setActiveUseCase(useCase.id)}
                  className={`group relative rounded-2xl border bg-white p-6 text-left transition-all hover:shadow-md ${
                    isActive
                      ? 'border-[#2563EB] shadow-sm'
                      : 'border-[#CBD5E1] hover:border-[#94A3B8]'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isActive ? 'bg-[#F1F5F9]' : 'bg-[#F1F5F9] group-hover:bg-[#E2E8F0]'
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${isActive ? 'text-[#2563EB]' : 'text-[#64748B]'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[#0F172A] mb-1">{useCase.title}</h3>
                      <p className="text-sm text-[#64748B]">{useCase.description}</p>
                    </div>
                  </div>
                  <div
                    className={`mt-4 flex items-center gap-2 text-sm font-medium transition-opacity ${
                      isActive
                        ? 'text-[#2563EB] opacity-100'
                        : 'text-[#64748B] opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <span>View flow</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </button>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Interactive Flow Section */}
      <Section className="py-16 md:py-24 bg-white/50">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Flow Visualization - Left 2 columns */}
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-bold text-[#0F172A] mb-8">How it works</h2>

              {/* Flow Steps */}
              <div className="relative space-y-0">
                {activeData.flow.map((step, index) => {
                  const StepIcon = step.icon;
                  const isLast = index === activeData.flow.length - 1;
                  const isActive = index === 0;

                  return (
                    <div key={index} className="relative pb-8">
                      <div className="flex items-center gap-4">
                        {/* Step Icon */}
                        <div className="relative flex-shrink-0">
                          <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-[#F1F5F9] border-2 transition-all ${
                            isActive ? 'border-[#2563EB] shadow-sm' : 'border-[#CBD5E1]'
                          }`}>
                            <StepIcon className={`h-7 w-7 transition-colors ${
                              isActive ? 'text-[#2563EB]' : 'text-[#64748B]'
                            }`} />
                          </div>
                          {isActive && (
                            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-green-500 pulse-dot"></div>
                          )}
                        </div>

                        {/* Step Label */}
                        <div className="flex-1 pt-1">
                          <div className={`text-base font-medium transition-colors ${
                            isActive ? 'text-[#0F172A]' : 'text-[#475569]'
                          }`}>
                            {step.label}
                          </div>
                        </div>
                      </div>

                      {/* Connector Line */}
                      {!isLast && (
                        <div className="absolute left-7 top-14 h-16 w-0.5 border-l border-dashed border-[#CBD5E1]/40 ml-[1px]">
                          <div 
                            className="absolute top-0 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-[#2563EB] flow-connector-dot"
                            style={{ animation: 'flowConnectorVertical 2s ease-in-out infinite' }}
                          ></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Side Description - Right 1 column */}
            <div className="lg:col-span-1">
              <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm sticky top-24">
                <h3 className="text-lg font-semibold text-[#0F172A] mb-4">What the agent does</h3>
                <ul className="space-y-3">
                  {activeData.bullets.map((bullet, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-[#2563EB] flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-[#475569] leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Outcomes Section */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {/* Metric 1 */}
            <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm text-center">
              <div className="text-3xl font-bold text-[#2563EB] mb-2">↓</div>
              <div className="text-xl font-bold text-[#0F172A] mb-2">Support volume</div>
              <p className="text-sm text-[#64748B]">Reduced repetitive inquiries</p>
            </div>

            {/* Metric 2 */}
            <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm text-center">
              <div className="text-3xl font-bold text-[#2563EB] mb-2">↑</div>
              <div className="text-xl font-bold text-[#0F172A] mb-2">Resolution speed</div>
              <p className="text-sm text-[#64748B]">Instant responses, faster resolution</p>
            </div>

            {/* Metric 3 */}
            <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 shadow-sm text-center">
              <div className="text-3xl font-bold text-[#2563EB] mb-2">24/7</div>
              <div className="text-xl font-bold text-[#0F172A] mb-2">Coverage</div>
              <p className="text-sm text-[#64748B]">Always available, always consistent</p>
            </div>
          </div>
        </Container>
      </Section>

      {/* CTA Section */}
      <Section className="py-16 md:py-24">
        <Container>
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-8 md:p-12 text-center shadow-sm max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl mb-4">
              Want to see this live?
            </h2>
            <p className="text-base text-[#475569] mb-8 max-w-xl mx-auto">
              Try the live voice agent now, then we'll help you set up your own workflow.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={scrollToHero} size="lg" className="w-full sm:w-auto">
                <Mic className="mr-2 h-5 w-5" />
                Talk to Denku AI
              </Button>
              <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
                <Link href="/signup">Get started</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

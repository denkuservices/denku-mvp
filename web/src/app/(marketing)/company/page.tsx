import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { Shield, Settings, Eye, Lock, Users, Database, Zap } from 'lucide-react';

const pillars = [
  { icon: Shield, title: 'Isolation', desc: 'Multi-tenant architecture with strict data boundaries between every workspace.' },
  { icon: Settings, title: 'Control', desc: 'Tools, policies, and operational guardrails — fully configurable per workspace.' },
  { icon: Eye, title: 'Observability', desc: 'Full-stack logs, transcripts, metrics, and real-time dashboards out of the box.' },
];

const steps = [
  { num: '01', title: 'Provision', desc: 'Create workspace and configure isolation.' },
  { num: '02', title: 'Configure', desc: 'Set up agents, tools, and policies.' },
  { num: '03', title: 'Deploy', desc: 'Go live with voice or chat channels.' },
];

const roadmap = [
  { icon: Lock, label: 'SSO/SAML' },
  { icon: Users, label: 'Advanced RBAC' },
  { icon: Database, label: 'Retention controls' },
  { icon: Zap, label: 'Connector marketplace' },
];

export default function CompanyPage() {
  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-24">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Company</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
              Built for <em className="font-medium italic text-[#1B6E6E]">production</em>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[18px] leading-relaxed text-[#2C3E54]">
              Isolation, control, and observability for voice and chat agents.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">
                Talk to Denku
              </Link>
              <Link href="/security" className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">
                View security
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* What we build */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">What we build</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-8 transition-all hover:-translate-y-1 hover:brand-shadow-md">
                  <div className="mb-5 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[20px] font-medium text-[#0A1A2F]">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#2C3E54]">{p.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* How teams adopt */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">How teams adopt</h2>
          </Reveal>
          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <Reveal key={step.num} delay={(i % 3) as 0 | 1 | 2} className="text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-[#1B6E6E]/30 font-display text-[15px] font-medium text-[#1B6E6E]">
                  {step.num}
                </div>
                <h3 className="font-display text-[18px] font-medium text-[#0A1A2F]">{step.title}</h3>
                <p className="mt-2 text-sm text-[#2C3E54]">{step.desc}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* Roadmap */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Planned next</h2>
          </Reveal>
          <div className="mx-auto max-w-3xl rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-8">
            <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="absolute left-0 right-0 top-1/2 hidden h-px bg-[#0A1A2F]/[0.08] md:block" />
              {roadmap.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="relative z-10 flex flex-col items-center gap-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#1B6E6E]/20 bg-[#F7F5F1] text-[#1B6E6E]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-medium text-[#2C3E54]">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">See security details.</h2>
            <p className="mb-8 text-sm text-[#2C3E54]">Request our security brief to review controls, compliance, and deployment practices.</p>
            <Link href="/security#request" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">
              Request security brief
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}

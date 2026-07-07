import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { SITE_NAME } from '@/config/site';

const pillars = [
  { title: 'Multi-tenant architecture', desc: 'Tenant-isolated data access and scoped tooling—built for SaaS scale and clean customer separation.' },
  { title: 'Operational control', desc: 'Explicit tools, policies, and guardrails so agents operate safely in production.' },
  { title: 'Observability', desc: 'Structured events and logs that support audits, iteration, and reliability.' },
];

const principles = [
  'Tenant isolation by default',
  'Least-privilege tools and scoped access',
  'Auditable operations with structured events',
  'Secure integrations and webhook hygiene',
  'Fast onboarding without sacrificing control',
];

export function AboutPage() {
  return (
    <Section className="py-16 md:py-20">
      <Container>
        <Reveal className="mx-auto max-w-3xl">
          <div className="brand-eyebrow mb-5">About</div>
          <h1 className="font-display text-[clamp(36px,4.5vw,56px)] font-normal tracking-[-1.5px] text-[#0A1A2F]">
            About {SITE_NAME}
          </h1>
          <p className="mt-4 text-[18px] leading-relaxed text-[#2C3E54]">
            {SITE_NAME} helps teams deploy AI agents—voice, chat, and automation—on an architecture designed for multi-tenant SaaS products.
          </p>
        </Reveal>

        <Reveal className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-[20px] border border-[#0A1A2F] bg-[#0A1A2F] p-8 md:p-10 brand-shadow-lg">
          <div className="brand-eyebrow mb-3 !text-[#3FA3A3] before:!bg-[#3FA3A3]">Mission</div>
          <div className="font-display text-[26px] font-normal tracking-[-0.5px] text-[#F7F5F1]">Make AI agents production-ready for modern businesses.</div>
          <p className="mt-3 text-[16px] leading-relaxed text-[#F7F5F1]/70">
            We focus on safe deployment patterns: explicit tools, scoped access, and clean observability — so companies can ship agents fast and operate them with confidence.
          </p>
        </Reveal>

        <div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
              <div className="mb-2 font-display text-[17px] font-medium text-[#0A1A2F]">{p.title}</div>
              <p className="text-sm text-[#2C3E54]">{p.desc}</p>
            </Reveal>
          ))}
        </div>

        <div className="mx-auto mt-6 grid max-w-3xl gap-4 md:grid-cols-2">
          <Reveal className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
            <div className="mb-4 font-display text-[17px] font-medium text-[#0A1A2F]">Principles</div>
            <ul className="space-y-2">
              {principles.map((x) => (
                <li key={x} className="flex items-start gap-2.5 text-sm text-[#2C3E54]">
                  <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#1B6E6E]" />
                  {x}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={1} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6">
            <div className="mb-3 font-display text-[17px] font-medium text-[#0A1A2F]">What you get</div>
            <p className="mb-6 text-sm text-[#2C3E54]">
              A platform that starts simple and grows with you: from one agent to many, from one channel to omnichannel, from basic logging to enterprise-grade controls.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/pricing" className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#0A1A2F]/10 px-4 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">View pricing</Link>
              <Link href="/contact" className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0A1A2F] px-4 text-sm font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E]">Talk to us</Link>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

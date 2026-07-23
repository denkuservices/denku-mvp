import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { BookOpen, MessageSquare, Mail, Mic, AlertCircle, Webhook, Gauge, CreditCard } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Support',
  description:
    "Get help with Denku — how to reach support, common questions, and guidance on your AI voice employee.",
  alternates: { canonical: '/support' },
};

const supportPaths = [
  { icon: BookOpen, title: 'Documentation', desc: 'Setup, integrations, and operational best practices.', href: '/docs', label: 'Go to docs' },
  { icon: MessageSquare, title: 'Talk to Denku', desc: 'Try our live agent demo with no signup required.', href: '/', label: 'Try live demo' },
  { icon: Mail, title: 'Contact & Escalation', desc: 'Reach our team for demos, troubleshooting, and deployments.', href: '/#contact', label: 'Open a request' },
];

const slaPlans = [
  { name: 'Starter', level: 'Best effort', desc: 'Community support and email responses typically within 1–2 business days.' },
  { name: 'Growth', level: 'Priority handling', desc: 'Priority support with same-business-day response targets.', highlight: true },
  { name: 'Scale', level: 'Contractual SLA', desc: 'Guaranteed response times and escalation paths defined in contract.' },
];

const commonFixes = [
  { icon: Mic, q: 'Microphone permission', a: 'Ensure your browser allows microphone access. Check site settings and grant permission when prompted. For persistent issues, clear browser cache and retry.' },
  { icon: AlertCircle, q: 'Agent not starting', a: 'Check agent configuration (system prompt, tools, boundaries). Verify tool credentials are valid and accessible. Review logs in dashboard for specific error messages.' },
  { icon: Webhook, q: 'Webhook verification', a: 'Copy your webhook secret from agent settings. Verify HMAC-SHA256 signature using the X-Signature header. Compare against computed hash of request body + secret.' },
  { icon: Gauge, q: 'Latency', a: 'Check network latency to your tool/webhook endpoints. Review agent logs for slow tool responses. Consider tool caching or async webhooks for heavy operations.' },
  { icon: CreditCard, q: 'Billing & invoices', a: 'View billing history in workspace settings. Download invoices from billing page. For plan changes, contact support for prorated adjustments.' },
];

export default function SupportPage() {
  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-24">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Support</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
              Help that&apos;s <em className="font-medium italic text-[#1B6E6E]">predictable</em>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[18px] text-[#2C3E54]">Docs, response targets, and escalation when it matters.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">Contact support</Link>
              <Link href="/docs" className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">Read docs</Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Paths */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Choose your path</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {supportPaths.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal key={p.title} delay={(i % 3) as 0 | 1 | 2} className="flex flex-col rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-8 text-center">
                  <div className="mx-auto mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[18px] font-medium text-[#0A1A2F]">{p.title}</h3>
                  <p className="mb-6 mt-2 flex-1 text-sm text-[#2C3E54]">{p.desc}</p>
                  <Link href={p.href} className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#0A1A2F]/10 px-5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">{p.label}</Link>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* SLA */}
      <Section>
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Response targets</h2>
          </Reveal>
          <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-3">
            {slaPlans.map((p, i) => (
              <Reveal key={p.name} delay={(i % 3) as 0 | 1 | 2} className={`rounded-[18px] border p-6 ${p.highlight ? 'border-[#0A1A2F] bg-[#0A1A2F] brand-shadow-md' : 'border-[#0A1A2F]/[0.06] bg-[#FBFAF8]'}`}>
                <div className={`mb-1 text-sm font-bold ${p.highlight ? 'text-[#3FA3A3]' : 'text-[#6B7888]'}`}>{p.name}</div>
                <div className={`mb-3 font-display text-[18px] font-medium ${p.highlight ? 'text-[#F7F5F1]' : 'text-[#0A1A2F]'}`}>{p.level}</div>
                <p className={`text-sm leading-relaxed ${p.highlight ? 'text-[#F7F5F1]/75' : 'text-[#2C3E54]'}`}>{p.desc}</p>
              </Reveal>
            ))}
          </div>
          <p className="mt-4 text-center font-brand-mono text-xs text-[#6B7888]">Exact SLAs depend on contract.</p>
        </Container>
      </Section>

      {/* Common fixes */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Common fixes</h2>
            <div className="space-y-4">
              {commonFixes.map((fix) => {
                const Icon = fix.icon;
                return (
                  <div key={fix.q} className="flex gap-4 rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#E3EEED] text-[#134F4F]">
                      <Icon className="h-[18px] w-[18px]" />
                    </div>
                    <div>
                      <div className="mb-1 font-display text-[16px] font-medium text-[#0A1A2F]">{fix.q}</div>
                      <p className="text-sm leading-relaxed text-[#2C3E54]">{fix.a}</p>
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
            <h2 className="mb-4 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">System status</h2>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1B6E6E]/25 bg-[#E3EEED] px-4 py-2 text-sm font-medium text-[#134F4F]">
              <span className="h-2 w-2 rounded-full bg-[#1B6E6E] pulse-dot" />
              All systems operational
            </div>
            <p className="mt-4 text-sm text-[#6B7888]">Status page coming soon.</p>
          </div>
        </Container>
      </Section>

      {/* CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Need a deployment plan?</h2>
            <p className="mb-8 text-sm text-[#2C3E54]">Tell us your channels, tools, and volume. We&apos;ll propose a workflow.</p>
            <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">
              Request a demo
            </Link>
          </div>
        </Container>
      </Section>
    </>
  );
}

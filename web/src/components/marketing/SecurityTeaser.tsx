import Link from 'next/link';
import { Shield, FileText, Lock, Server } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const pillars = [
  { icon: Shield, title: 'Multi-tenant isolation', desc: 'Strict data boundaries between every workspace. RBAC enforced at every layer.' },
  { icon: FileText, title: 'Audit logs & webhooks', desc: 'Immutable audit trails and webhook signature verification on all events.' },
  { icon: Lock, title: 'Encryption everywhere', desc: 'AES-256 at rest and TLS 1.3 in transit. Zero plaintext secrets.' },
  { icon: Server, title: 'Infrastructure security', desc: 'SOC 2-aligned infrastructure. HIPAA compliance available on Scale.' },
];

export function SecurityTeaser() {
  return (
    <Section id="security" className="scroll-mt-20 border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <div className="brand-eyebrow mb-5">Security &amp; compliance</div>
            <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
              Enterprise-grade security,
              <br />
              <em className="font-medium italic text-[#1B6E6E]">without</em> the complexity.
            </h2>
            <p className="mt-5 max-w-md text-[18px] leading-relaxed text-[#2C3E54]">
              Built for production from day one — isolation, control, and observability that pass
              the security review.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href="/security"
                className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]"
              >
                View security
              </Link>
              <Link
                href="/security#request"
                className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]"
              >
                Request brief
              </Link>
            </div>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2">
            {pillars.map((p, i) => {
              const Icon = p.icon;
              return (
                <Reveal
                  key={p.title}
                  delay={(i % 2) as 0 | 1}
                  className="rounded-[14px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-6"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="font-display text-[16px] font-medium text-[#0A1A2F]">{p.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#2C3E54]">{p.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </Container>
    </Section>
  );
}

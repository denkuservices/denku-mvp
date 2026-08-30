import Link from 'next/link';
import { Shield, FileText, Lock, Server } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const pillars = [
  { icon: Shield, title: 'Multi-tenant isolation', desc: 'Strict data boundaries between every workspace. RBAC enforced at every layer.' },
  { icon: FileText, title: 'Audit logs & webhooks', desc: 'Immutable audit trails and webhook signature verification on all events.' },
  { icon: Lock, title: 'Encryption everywhere', desc: 'AES-256 at rest and TLS 1.3 in transit. Zero plaintext secrets.' },
  { icon: Server, title: 'Infrastructure security', desc: 'Security-first infrastructure: encrypted data, tenant isolation, audited access. Formal SOC 2 / HIPAA are on our roadmap, not yet certified.' },
];

export function SecurityTeaser() {
  return (
    <Section id="security" className="scroll-mt-20 border-t border-[var(--s-border)] bg-[var(--s-panel-2)]">
      <Container>
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <Reveal>
            <div className="brand-eyebrow mb-5">Security &amp; compliance</div>
            <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[var(--s-ink)]">
              Security you can verify,
              <br />
              <em className="font-medium italic text-[var(--s-accent)]">without</em> the complexity.
            </h2>
            <p className="mt-5 max-w-md text-[18px] leading-relaxed text-[var(--s-ink-soft)]">
              Built for production from day one — isolation, control, and observability that pass
              the security review.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                href="/security"
                className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--s-cta-bg)] px-6 py-3.5 text-sm font-medium text-[var(--s-cta-fg)] transition-all hover:-translate-y-0.5 hover:bg-[var(--s-accent)]"
              >
                View security
              </Link>
              <Link
                href="/security#request"
                className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--s-border)] px-6 py-3.5 text-sm font-medium text-[var(--s-ink)] transition-all hover:border-[var(--s-accent)] hover:text-[var(--s-accent)]"
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
                  className="rounded-[14px] border border-[var(--s-border)] bg-[var(--s-bg)] p-6"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--s-accent-soft)] text-[var(--s-accent-deep)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="font-display text-[16px] font-medium text-[var(--s-ink)]">{p.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--s-ink-soft)]">{p.desc}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </Container>
    </Section>
  );
}

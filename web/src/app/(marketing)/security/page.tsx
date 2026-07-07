import Link from 'next/link';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Reveal } from '@/components/marketing/Reveal';
import { Shield, FileText, Lock, Users, Key, Database } from 'lucide-react';

const securityPillars = [
  { icon: Shield, title: 'Tenant Isolation & RBAC', description: 'Strict data segregation with role-based access control. Each workspace operates in complete isolation.' },
  { icon: FileText, title: 'Audit Logs & Webhook Verification', description: 'Every action is logged with immutable timestamps. Signed webhook requests with HMAC verification.' },
  { icon: Lock, title: 'Encryption in Transit & at Rest', description: 'End-to-end encryption for all data. TLS 1.3 for transport, AES-256 for storage.' },
];

const detailedControls = [
  { icon: Users, title: 'Data Isolation Model', description: 'Multi-tenant architecture ensures complete data segregation. Each workspace operates independently with isolated compute and storage.' },
  { icon: Key, title: 'Access Control & Roles', description: 'Role-based access control (RBAC) with granular permissions. Define custom roles or use built-in templates for common patterns.' },
  { icon: FileText, title: 'Logging & Retention', description: 'Comprehensive audit logs capture all system events. Configurable retention policies to meet compliance requirements.' },
  { icon: Lock, title: 'Webhook Signing (HMAC)', description: 'All outbound webhooks are signed using HMAC-SHA256. Verify authenticity on your end using the shared secret.' },
  { icon: Database, title: 'SSO/SAML (Roadmap)', description: 'Enterprise single sign-on with SAML 2.0 support. Coming soon.' },
];

const securityFaqs = [
  { question: 'Where is data stored?', answer: 'Data is stored in secure, SOC 2-ready infrastructure. Specific region information available upon request under NDA.' },
  { question: 'How are webhooks verified?', answer: 'Every webhook payload includes an HMAC-SHA256 signature in the X-Signature header. Use your webhook secret to verify authenticity on your servers.' },
  { question: 'What retention options are available?', answer: 'Retention policies vary by plan. Starter includes 30 days, Growth includes 90 days, and Scale offers custom retention periods.' },
  { question: 'When will SSO/SAML be available?', answer: 'SSO/SAML is on our roadmap for enterprise plans. Contact us for timeline and early access information.' },
];

export default function SecurityPage() {
  return (
    <>
      {/* Hero */}
      <Section className="py-16 md:py-24">
        <Container>
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="brand-eyebrow centered mb-5 justify-center">Security &amp; compliance</div>
            <h1 className="font-display text-[clamp(36px,4.5vw,60px)] font-normal leading-[1.06] tracking-[-1.5px] text-[#0A1A2F]">
              Enterprise-grade <em className="font-medium italic text-[#1B6E6E]">security</em>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[18px] leading-relaxed text-[#2C3E54]">
              Enterprise-grade controls without the complexity.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[#0A1A2F] px-6 py-3.5 text-sm font-medium text-[#F7F5F1] transition-all hover:-translate-y-0.5 hover:bg-[#1B6E6E]">
                Request security brief
              </Link>
              <Link href="/docs" className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 px-6 py-3.5 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]">
                View docs
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* Pillars */}
      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            {securityPillars.map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <Reveal key={pillar.title} delay={(i % 3) as 0 | 1 | 2} className="rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-6 transition-all hover:-translate-y-1 hover:brand-shadow-md">
                  <div className="mb-4 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[22px] w-[22px]" />
                  </div>
                  <h3 className="font-display text-[20px] font-medium text-[#0A1A2F]">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#2C3E54]">{pillar.description}</p>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Detailed controls */}
      <Section className="border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
        <Container>
          <Reveal className="mb-12 text-center">
            <h2 className="font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Detailed controls</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#2C3E54]">Comprehensive security features for production environments.</p>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {detailedControls.map((control, i) => {
              const Icon = control.icon;
              return (
                <Reveal key={control.title} delay={(i % 2) as 0 | 1} className="flex gap-4 rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#E3EEED] text-[#134F4F]">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <h3 className="font-display text-[17px] font-medium text-[#0A1A2F]">{control.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#2C3E54]">{control.description}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Request brief */}
      <Section id="request" className="scroll-mt-20">
        <Container>
          <Reveal className="mx-auto max-w-2xl overflow-hidden rounded-[20px] border border-[#0A1A2F] bg-[#0A1A2F] p-10 text-center brand-shadow-lg">
            <h2 className="font-display text-[clamp(26px,3vw,38px)] font-normal tracking-[-1px] text-[#F7F5F1]">Request security brief</h2>
            <p className="mt-3 text-sm text-[#F7F5F1]/70">We can share detailed security documentation under NDA.</p>
            <div className="mt-8">
              <Link href="/#contact" className="inline-flex items-center gap-2 rounded-[10px] bg-[#1B6E6E] px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-[#228585]">
                Request the security brief
              </Link>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* FAQ */}
      <Section className="border-t border-[#0A1A2F]/[0.06]">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-10 text-center font-display text-[clamp(28px,3.4vw,42px)] font-normal tracking-[-1px] text-[#0A1A2F]">Security FAQ</h2>
            <div className="space-y-6">
              {securityFaqs.map((faq) => (
                <div key={faq.question} className="border-b border-[#0A1A2F]/[0.08] pb-6">
                  <h3 className="mb-2 font-display text-[17px] font-medium text-[#0A1A2F]">{faq.question}</h3>
                  <p className="text-sm leading-relaxed text-[#2C3E54]">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

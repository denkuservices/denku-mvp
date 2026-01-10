import Link from 'next/link';
import { SectionHeader } from '@/components/marketing/SectionHeader';
import { Button } from '@/components/marketing/Button';
import { Container } from '@/components/marketing/Container';
import { Section } from '@/components/marketing/Section';
import { Shield, FileText, Lock, Users, Key, Database } from 'lucide-react';

const securityPillars = [
  {
    icon: Shield,
    title: 'Tenant Isolation & RBAC',
    description: 'Strict data segregation with role-based access control. Each workspace operates in complete isolation.',
  },
  {
    icon: FileText,
    title: 'Audit Logs & Webhook Verification',
    description: 'Every action is logged with immutable timestamps. Signed webhook requests with HMAC verification.',
  },
  {
    icon: Lock,
    title: 'Encryption in Transit & at Rest',
    description: 'End-to-end encryption for all data. TLS 1.3 for transport, AES-256 for storage.',
  },
];

const detailedControls = [
  {
    icon: Users,
    title: 'Data Isolation Model',
    description: 'Multi-tenant architecture ensures complete data segregation. Each workspace operates independently with isolated compute and storage.',
  },
  {
    icon: Key,
    title: 'Access Control & Roles',
    description: 'Role-based access control (RBAC) with granular permissions. Define custom roles or use built-in templates for common patterns.',
  },
  {
    icon: FileText,
    title: 'Logging & Retention',
    description: 'Comprehensive audit logs capture all system events. Configurable retention policies to meet compliance requirements.',
  },
  {
    icon: Lock,
    title: 'Webhook Signing (HMAC)',
    description: 'All outbound webhooks are signed using HMAC-SHA256. Verify authenticity on your end using the shared secret.',
  },
  {
    icon: Database,
    title: 'SSO/SAML (Roadmap)',
    description: 'Enterprise single sign-on with SAML 2.0 support. Coming soon.',
  },
];

const securityFaqs = [
  {
    question: 'Where is data stored?',
    answer: 'Data is stored in secure, SOC 2-ready infrastructure. Specific region information available upon request under NDA.',
  },
  {
    question: 'How are webhooks verified?',
    answer: 'Every webhook payload includes an HMAC-SHA256 signature in the X-Signature header. Use your webhook secret to verify authenticity on your servers.',
  },
  {
    question: 'What retention options are available?',
    answer: 'Retention policies vary by plan. Starter includes 30 days, Pro includes 90 days, and Enterprise offers custom retention periods to meet compliance needs.',
  },
  {
    question: 'When will SSO/SAML be available?',
    answer: 'SSO/SAML is on our roadmap for Enterprise plans. Contact sales for timeline and early access information.',
  },
];

export default function SecurityPage() {
  return (
    <>
      <SectionHeader
        title="Security"
        description="Enterprise-grade controls without the complexity."
        ctaPrimary={{ label: 'Request security brief', href: '/#contact' }}
        ctaSecondary={{ label: 'View docs', href: '/docs' }}
      />

      {/* Security Pillars */}
      <Section>
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            {securityPillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl">
                    <Icon className="h-6 w-6 text-[#2563EB]" />
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-[#0F172A]">
                    {pillar.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                    {pillar.description}
                  </p>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Detailed Controls */}
      <Section>
        <Container>
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Detailed Controls
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-[#475569]">
              Comprehensive security features for production environments.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {detailedControls.map((control) => {
              const Icon = control.icon;
              return (
                <div
                  key={control.title}
                  className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-5 w-5 text-[#2563EB]" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-[#0F172A]">
                        {control.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-[#475569]">
                        {control.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* Request Section */}
      <Section id="request" className="scroll-mt-20">
        <Container>
          <div className="max-w-2xl mx-auto text-center rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-8">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Request Security Brief
            </h2>
            <p className="mt-4 text-sm text-[#475569]">
              We can share detailed security documentation under NDA.
            </p>
            <div className="mt-8">
              <Button asChild size="lg" className="text-base">
                <Link href="/#contact">Request the security brief</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-[#64748B]">
              We can share details under NDA.
            </p>
          </div>
        </Container>
      </Section>

      {/* FAQ */}
      <Section>
        <Container>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl text-center mb-12">
              Security FAQ
            </h2>
            <div className="space-y-8">
              {securityFaqs.map((faq, i) => (
                <div key={i} className="border-b border-[#CBD5E1] pb-6">
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">
                    {faq.question}
                  </h3>
                  <p className="text-sm text-[#475569] leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>

      {/* Bottom CTA */}
      <Section className="py-16 md:py-20">
        <Container>
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Questions about security?
            </h2>
            <p className="mt-4 text-sm text-[#475569]">
              Contact us for detailed security documentation and compliance information.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <Button asChild size="lg" className="text-base">
                <Link href="/#contact">Contact sales</Link>
              </Button>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

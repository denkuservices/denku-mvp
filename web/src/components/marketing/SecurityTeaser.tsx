import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Button } from './Button';
import { Shield, FileText, Lock } from 'lucide-react';

const securityBullets = [
  {
    icon: Shield,
    text: 'Multi-tenant isolation & RBAC',
  },
  {
    icon: FileText,
    text: 'Audit logs & webhook verification',
  },
  {
    icon: Lock,
    text: 'Encryption in transit & at rest',
  },
];

export function SecurityTeaser() {
  return (
    <Section id="security" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
            Security & Compliance
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-[#475569]">
            Enterprise-grade security without the complexity.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {securityBullets.map((bullet) => {
            const Icon = bullet.icon;
            return (
              <div
                key={bullet.text}
                className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-shadow-100"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
                  <Icon className="h-5 w-5 text-[#2563EB]" />
                </div>
                <p className="text-sm font-medium text-[#0F172A]">
                  {bullet.text}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <p className="mb-4 text-sm text-[#64748B]">
            Optional: SSO/SAML (Roadmap)
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary">
              <Link href="/security#request">Request security brief</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/security">View security</Link>
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}

import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Button } from './Button';
import {
  Users,
  FileText,
  Lock,
  ShieldCheck,
  Key,
  Database,
} from 'lucide-react';

const securityFeatures = [
  {
    icon: Users,
    title: 'Multi-tenant Isolation & RBAC',
    description: 'Strict data segregation with role-based access control. Each workspace operates in complete isolation.',
  },
  {
    icon: FileText,
    title: 'Audit Logs & Immutable Trail',
    description: 'Every action is logged with immutable timestamps. Full audit trail for compliance and debugging.',
  },
  {
    icon: Lock,
    title: 'Encryption in Transit & at Rest',
    description: 'End-to-end encryption for all data. TLS 1.3 for transport, AES-256 for storage.',
  },
  {
    icon: ShieldCheck,
    title: 'Webhook Verification',
    description: 'Signed requests with HMAC verification. Validate every webhook payload for authenticity.',
  },
  {
    icon: Key,
    title: 'SSO/SAML',
    description: 'Enterprise single sign-on with SAML 2.0 support. Coming Q2 2024.',
    roadmap: true,
  },
  {
    icon: Database,
    title: 'Data Retention & Access Controls',
    description: 'Configurable retention policies. Granular access controls with audit logging.',
  },
];

export function Security() {
  return (
    <Section id="security" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-navy-700 md:text-4xl">
            Security & Compliance
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-600">
            Built for teams that need enterprise-grade security without the complexity.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {securityFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                  <Icon className="h-6 w-6 text-brand-500" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-navy-700">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {feature.description}
                </p>
                {feature.roadmap && (
                  <span className="mt-3 inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
                    Roadmap
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" className="bg-brand-500 text-white hover:bg-brand-600">
            <Link href="#contact">Request security brief</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

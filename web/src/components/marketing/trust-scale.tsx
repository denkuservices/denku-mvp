import { Container } from './Container';
import { Section } from './Section';
import { Shield, BarChart3, Lock } from 'lucide-react';

const features = [
  {
    name: 'Multi-Tenant Architecture',
    description:
      'Strict data isolation and access control ensure your customers\' data is always secure and segregated.',
    icon: Shield,
  },
  {
    name: 'Full Observability',
    description:
      'Get complete visibility into agent performance with structured logs, dashboards, and alerts.',
    icon: BarChart3,
  },
  {
    name: 'Secure by Design',
    description:
      'From webhook authentication to SOC 2 compliance, we provide the security foundation you need.',
    icon: Lock,
  },
];

export function TrustScale() {
  return (
    <Section id="features" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-navy-700 md:text-4xl">
            Designed for Trust & Scale
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-600">
            We're obsessed with security, reliability, and performance so you can focus on
            building great products.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.name}
                className="group relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-8 transition-all hover:shadow-3xl hover:-translate-y-1"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-50">
                  <Icon className="h-7 w-7 text-brand-500" />
                </div>
                <h3 className="mt-6 text-xl font-bold text-navy-700">
                  {feature.name}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

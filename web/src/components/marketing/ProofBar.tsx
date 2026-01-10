import { Container } from './Container';
import { Section } from './Section';
import { Zap, Shield, BarChart3 } from 'lucide-react';

const proofItems = [
  {
    icon: Zap,
    title: 'Deploy in hours',
    description: 'Not weeks. Get your first agent live quickly.',
  },
  {
    icon: Shield,
    title: 'Isolation by default',
    description: 'Multi-tenant architecture from day one.',
  },
  {
    icon: BarChart3,
    title: 'Audit-ready observability',
    description: 'Full logs, metrics, and compliance tracking.',
  },
];

export function ProofBar() {
  return (
    <Section className="py-8 md:py-12">
      <Container>
        <div className="grid gap-4 md:grid-cols-3">
          {proofItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 text-center transition-all hover:shadow-3xl hover:-translate-y-1"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                  <Icon className="h-6 w-6 text-brand-500" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-navy-700">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

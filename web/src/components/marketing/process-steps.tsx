import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const steps = [
  {
    number: '1',
    title: 'Provision Your Environment',
    description: 'Create a secure, isolated workspace for your agents and data with multi-tenant architecture.',
  },
  {
    number: '2',
    title: 'Configure Agent Behavior',
    description: 'Define skills, connect tools, and set operational boundaries with full observability.',
  },
  {
    number: '3',
    title: 'Deploy & Scale',
    description: 'Go live on any channel and monitor performance with built-in analytics and alerts.',
  },
];

export function ProcessSteps() {
  return (
    <Section className="bg-white/50">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-navy-700 md:text-4xl">
            A Better Way to Build, Deploy, Manage Agents
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-gray-600">
            SovereignAI is built for SaaS teams who need a secure, reliable, and scalable
            platform for production-grade AI agents.
          </p>
        </div>

        <div className="relative mt-16">
          <div className="grid gap-12 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="relative flex flex-col items-center text-center"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border-2 border-brand-500 bg-white text-xl font-bold text-brand-500 shadow-shadow-100">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold text-navy-700">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 max-w-sm">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" variant="outline" className="border-2 border-gray-200 text-navy-700 hover:bg-gray-50">
            <Link href="#contact">Talk to sales</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

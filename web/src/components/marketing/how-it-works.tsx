import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const steps = [
  {
    title: 'Provision Your Environment',
    desc: 'Create a secure, isolated workspace for your agents and data.',
  },
  {
    title: 'Configure Agent Behavior',
    desc: 'Define skills, connect tools, and set operational boundaries.',
  },
  {
    title: 'Deploy & Scale',
    desc: 'Go live on any channel and monitor performance with built-in observability.',
  },
];

export function HowItWorks() {
  return (
    <Section className="bg-muted/30">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A Better Way to Build, Deploy, and Manage Agents
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            SovereignAI is built for SaaS teams who need a secure, reliable, and scalable
            platform for production-grade AI agents.
          </p>
        </div>

        <div className="relative mt-12">
          <div className="grid gap-8 md:grid-cols-3 md:gap-12">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="relative flex flex-col items-center text-center"
              >
                <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-full border bg-background text-lg font-semibold">
                  {i + 1}
                </div>
                <h3 className="text-xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center">
          <Button asChild size="lg" variant="outline">
            <Link href="/contact">Talk to sales</Link>
          </Button>
        </div>
      </Container>
    </Section>
  );
}

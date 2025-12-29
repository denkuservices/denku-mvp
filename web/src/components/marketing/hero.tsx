import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const trustItems = [
  'Multi-Tenant Architecture',
  'Secure Tool Integration',
  'Production-Ready from Day One',
  'Voice, Chat & Automation',
];

export function Hero() {
  return (
    <Section className="py-20 text-center md:py-32">
      <Container>
        <p className="text-sm text-muted-foreground">SovereignAI · Sovereign-grade AI agents</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-6xl md:leading-tight">
          Build Production-Ready AI Agents
        </h1>
        <p className="mx-auto mt-4 max-w-3xl text-lg text-muted-foreground md:text-xl">
          A secure platform for SaaS teams to build, deploy, and manage production-grade AI agents
          with multi-tenant isolation, operational control, and full observability.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/pricing">Get Started</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/contact">Request Demo</Link>
          </Button>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
              <svg
                className="h-5 w-5 flex-none text-foreground/60"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

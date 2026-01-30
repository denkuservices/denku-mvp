import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';
import { SITE_NAME } from '@/config/site';

const pillars = [
  {
    title: 'Multi-tenant architecture',
    desc: 'Tenant-isolated data access and scoped tooling—built for SaaS scale and clean customer separation.',
  },
  {
    title: 'Operational control',
    desc: 'Explicit tools, policies, and guardrails so agents operate safely in production.',
  },
  {
    title: 'Observability',
    desc: 'Structured events and logs that support audits, iteration, and reliability.',
  },
];

const principles = [
  'Tenant isolation by default',
  'Least-privilege tools and scoped access',
  'Auditable operations with structured events',
  'Secure integrations and webhook hygiene',
  'Fast onboarding without sacrificing control',
];

export function AboutPage() {
  return (
    <>
      <Section className="py-14 md:py-16">
        <Container>
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              About {SITE_NAME}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {SITE_NAME} helps teams deploy AI agents—voice, chat, and automation—on an
              architecture designed for multi-tenant SaaS products.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border bg-background p-8 md:p-10">
            <div className="text-sm text-muted-foreground">Mission</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">
              Make AI agents production-ready for modern businesses.
            </div>
            <p className="mt-3 text-muted-foreground">
              We focus on safe deployment patterns: explicit tools, scoped access, and
              clean observability— so companies can ship agents fast and operate them
              with confidence.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {pillars.map((p) => (
              <div key={p.title} className="rounded-2xl border bg-background p-6">
                <div className="text-xl font-semibold tracking-tight">{p.title}</div>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border bg-background p-6">
              <div className="text-xl font-semibold tracking-tight">Principles</div>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {principles.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border bg-background p-6">
              <div className="text-xl font-semibold tracking-tight">What you get</div>
              <p className="mt-2 text-sm text-muted-foreground">
                A platform that starts simple (MVP) and grows with you: from one agent to
                many, from one channel to omnichannel, from basic logging to
                enterprise-grade controls.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild variant="outline">
                  <Link href="/pricing">View pricing</Link>
                </Button>
                <Button asChild>
                  <Link href="/contact">Talk to us</Link>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}

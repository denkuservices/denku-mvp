import { Container } from './Container';
import { Section } from './Section';

const features = [
  {
    name: 'Built for Multi-Tenancy',
    description:
      'Our architecture ensures strict data isolation and access control, so your customers’ data is always secure and segregated.',
    icon: (
      <svg
        className="h-8 w-8 text-foreground/80"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 22h16" />
        <path d="M6 18V8" />
        <path d="M12 18V4" />
        <path d="M18 18V12" />
      </svg>
    ),
  },
  {
    name: 'Reliable & Observable',
    description:
      'Get full visibility into agent performance with structured logs, dashboards, and alerts for production-grade reliability.',
    icon: (
      <svg
        className="h-8 w-8 text-foreground/80"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    name: 'Secure by Design',
    description:
      'From webhook authentication to SOC 2 compliance, we provide the security foundation you need to ship with confidence.',
    icon: (
      <svg
        className="h-8 w-8 text-foreground/80"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

export function SocialProof() {
  return (
    <Section>
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            A Platform Designed for Trust & Scale
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            We’re obsessed with security, reliability, and performance so you can focus on
            building great products.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.name}
              className="flex flex-col items-center text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
                {feature.icon}
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight">
                {feature.name}
              </h3>
              <p className="mt-2 text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

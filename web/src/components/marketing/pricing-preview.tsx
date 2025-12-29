import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const plans = [
  {
    name: 'Starter',
    price: 'From $49',
    note: '',
    desc: 'For small teams getting started with their first AI agent.',
    features: ['1 Agent', 'Basic Analytics', 'Standard Integrations'],
    cta: { label: 'Choose Plan', href: '/pricing' },
  },
  {
    name: 'Pro',
    price: 'From $99',
    note: '',
    desc: 'For growing teams that need more power and customization.',
    features: [
      'Up to 10 Agents',
      'Advanced Analytics',
      'Custom Tools & Webhooks',
      'Priority Support',
    ],
    highlight: true,
    cta: { label: 'Choose Plan', href: '/pricing' },
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    note: 'annual billing',
    desc: 'For organizations with advanced security and compliance needs.',
    features: [
      'Unlimited Agents',
      'Custom Isolation Architecture',
      'Security Reviews & SLA',
      'Dedicated Support',
    ],
    cta: { label: 'Contact Sales', href: '/contact' },
  },
];

export function PricingPreview() {
  return (
    <Section>
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Find the right plan for your team. Scale up as you grow.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={[
                'flex flex-col rounded-2xl border p-6 shadow-sm',
                p.highlight ? 'border-foreground/40' : '',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-xl font-semibold tracking-tight">{p.name}</h3>
                {p.highlight && (
                  <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
                    Most Popular
                  </span>
                )}
              </div>

              <div className="mt-4">
                <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                {p.note && <span className="ml-2 text-sm text-muted-foreground">{p.note}</span>}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{p.desc}</p>

              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-3">
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
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                className="mt-8 w-full"
                variant={p.highlight ? 'default' : 'outline'}
              >
                <Link href={p.cta.href}>{p.cta.label}</Link>
              </Button>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

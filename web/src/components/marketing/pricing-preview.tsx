import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';
import { pricingPlans } from './pricing-data';

const plans = pricingPlans.map(plan => ({
  name: plan.name,
  price: plan.price || plan.monthlyPrice,
  note: plan.note || '',
  desc: plan.desc || plan.bestFor || '',
  features: plan.features,
  highlight: plan.highlight,
  cta: plan.cta,
}));

export function PricingPreview() {
  return (
    <Section id="pricing" className="scroll-mt-20">
      <Container>
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Simple, Transparent Pricing
          </h2>
          <div className="mx-auto mt-4 max-w-2xl space-y-2">
            <p className="text-base font-semibold text-foreground">
              Unlimited personas. Limited concurrent calls.
            </p>
            <p className="text-sm text-muted-foreground">
              Personas define behavior. Concurrency defines capacity. Included minutes are a capacity bonus.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-3">
              Phone numbers create entry points. Concurrent calls define capacity.
            </p>
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.name}
              className={[
                'group flex flex-col rounded-2xl border p-8 shadow-sm transition-all',
                p.highlight 
                  ? 'border-foreground/40 shadow-md scale-105' 
                  : 'border-border/50 hover:shadow-md hover:-translate-y-1',
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

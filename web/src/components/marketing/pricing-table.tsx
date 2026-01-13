import Link from 'next/link';
import { pricingPlans } from './pricing-data';

const plans = pricingPlans.map(plan => ({
  name: plan.name,
  price: plan.price || plan.monthlyPrice,
  cadence: plan.cadence || (plan.monthlyPrice !== 'Custom' ? '/mo' : ''),
  desc: plan.desc || plan.bestFor || '',
  features: plan.features,
  highlight: plan.highlight,
  cta: plan.cta,
}));

const faqs = [
  {
    q: 'Do phone numbers increase concurrency?',
    a: 'No. Phone numbers create entry points. Concurrent calls define capacity. Additional phone numbers ($10/number/month) do not increase your concurrency limit.',
  },
  {
    q: 'Can I add more personas without upgrading?',
    a: 'Yes. All plans include unlimited core personas (Support, FAQ, Router, After-hours). Additional specialized personas (Sales Agent, CEO/Ops Agent) are available as add-ons and share your existing concurrency pool.',
  },
  {
    q: 'How does overage pricing work?',
    a: 'Each plan includes minutes as a capacity bonus. Overage is charged per minute at the plan rate (Starter: $0.22/min, Growth: $0.18/min, Scale: from $0.13/min).',
  },
];

export function PricingTable() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Pricing</h1>
        <div className="mt-4 space-y-2">
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

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={[
              'rounded-2xl border bg-background p-6',
              p.highlight ? 'border-foreground/40 shadow-sm' : '',
            ].join(' ')}
          >
            <div className="flex items-baseline justify-between">
              <div className="text-lg font-semibold tracking-tight">{p.name}</div>
              {p.highlight ? (
                <span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                  Best value
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex items-end gap-2">
              <div className="text-3xl font-semibold tracking-tight">{p.price}</div>
              {p.cadence ? <div className="text-sm text-muted-foreground">{p.cadence}</div> : null}
            </div>

            <p className="mt-3 text-sm text-muted-foreground">{p.desc}</p>

            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={p.cta.href}
              className={[
                'mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition',
                p.highlight
                  ? 'bg-foreground text-background hover:opacity-90'
                  : 'border hover:bg-muted',
              ].join(' ')}
            >
              {p.cta.label}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {faqs.map((f) => (
          <div key={f.q} className="rounded-2xl border bg-background p-6">
            <div className="text-base font-semibold tracking-tight">{f.q}</div>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border bg-background p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Need enterprise?</div>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              We can support custom isolation, security reviews, SLAs, and migration/onboarding.
            </p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90 transition"
          >
            Talk to sales
          </Link>
        </div>
      </div>
    </section>
  );
}

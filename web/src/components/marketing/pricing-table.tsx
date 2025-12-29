import Link from 'next/link';

const plans = [
  {
    name: 'Starter',
    price: '$99',
    cadence: '/mo',
    desc: 'Launch your first agent with a clean, fast setup.',
    features: [
      '1–2 agents',
      'Voice or chat',
      'Basic analytics',
      'Standard support',
    ],
    cta: { label: 'Start Starter', href: '/signup' },
  },
  {
    name: 'Pro',
    price: '$299',
    cadence: '/mo',
    desc: 'Scale across channels with tools and webhooks.',
    features: [
      'Up to 10 agents',
      'Voice + chat',
      'Tools & webhooks',
      'Advanced analytics',
      'Priority support',
    ],
    highlight: true,
    cta: { label: 'Start Pro', href: '/signup' },
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: '',
    desc: 'Security reviews, SLAs, and custom requirements.',
    features: [
      'Custom isolation model',
      'SLA & compliance support',
      'Dedicated success engineer',
      'Custom integrations',
    ],
    cta: { label: 'Contact Sales', href: '/contact' },
  },
];

const faqs = [
  {
    q: 'Do you support multi-tenant setups?',
    a: 'Yes. The platform is designed around tenant-scoped data access and tool permissions.',
  },
  {
    q: 'Can I start with one agent and scale later?',
    a: 'Yes. Start small and upgrade as your usage, channels, and workflows grow.',
  },
  {
    q: 'Do you offer enterprise contracts?',
    a: 'Yes. We can provide custom terms, SLAs, security documentation, and onboarding support.',
  },
];

export function PricingTable() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Pricing</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Simple plans built for speed. Upgrade when you need more agents, channels, or tooling.
        </p>
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

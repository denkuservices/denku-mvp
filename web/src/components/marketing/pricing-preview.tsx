import Link from 'next/link';

const plans = [
  {
    name: 'Starter',
    price: '$99',
    note: 'per month',
    desc: 'For small teams launching their first AI agent.',
    features: ['1–2 agents', 'Basic analytics', 'Standard support'],
    cta: { label: 'Start', href: '/signup' },
  },
  {
    name: 'Pro',
    price: '$299',
    note: 'per month',
    desc: 'For growing teams with multiple channels and workflows.',
    features: ['Up to 10 agents', 'Tools & webhooks', 'Advanced analytics'],
    highlight: true,
    cta: { label: 'Get Pro', href: '/signup' },
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    note: '',
    desc: 'For regulated teams and high-volume operations.',
    features: ['Custom isolation', 'SLA & security reviews', 'Dedicated support'],
    cta: { label: 'Contact sales', href: '/contact' },
  },
];

export function PricingPreview() {
  return (
    <section className="py-10 md:py-14">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Pricing</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Simple plans. Upgrade as you scale. Enterprise options available for custom requirements.
          </p>
        </div>

        <Link
          href="/pricing"
          className="hidden md:inline-flex rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition"
        >
          See full pricing
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
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
                  Most popular
                </span>
              ) : null}
            </div>

            <div className="mt-4">
              <div className="text-3xl font-semibold tracking-tight">{p.price}</div>
              {p.note ? <div className="text-sm text-muted-foreground">{p.note}</div> : null}
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
    </section>
  );
}

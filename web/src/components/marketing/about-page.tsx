import Link from 'next/link';

const pillars = [
  {
    title: 'Multi-tenant by design',
    desc: 'Tenant-scoped data access and isolated operations so you can scale without mixing customer data.',
  },
  {
    title: 'Tooling-first automation',
    desc: 'Agents act through explicit tools and webhooks—predictable, auditable, and safer than free-form actions.',
  },
  {
    title: 'Operational visibility',
    desc: 'Structured events and logs so teams can measure outcomes and improve workflows continuously.',
  },
];

const principles = [
  'Fast onboarding without sacrificing control',
  'Security and least-privilege access patterns',
  'Clear separation between marketing site and application',
  'Built to evolve from MVP to enterprise',
];

export function AboutPage() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">About SovereignAI</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          SovereignAI helps teams deploy AI agents—voice, chat, and automation—on an architecture
          designed for multi-tenant SaaS products.
        </p>
      </div>

      <div className="mt-10 rounded-2xl border bg-background p-8 md:p-10">
        <div className="text-sm text-muted-foreground">Mission</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          Make AI agents production-ready for modern businesses.
        </div>
        <p className="mt-3 text-muted-foreground">
          We focus on safe deployment patterns: explicit tools, scoped access, and clean observability—
          so companies can ship agents fast and operate them with confidence.
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
            A platform that starts simple (MVP) and grows with you: from one agent to many, from one
            channel to omnichannel, from basic logging to enterprise-grade controls.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition"
            >
              View pricing
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';

const cases = [
  {
    title: 'Customer Support',
    subtitle: 'Reduce ticket volume and improve response time.',
    bullets: [
      'Answer FAQs and product questions instantly',
      'Create tickets with structured payloads',
      'Escalate to humans with full context',
    ],
    outcomes: ['Lower support costs', 'Consistent quality', '24/7 coverage'],
  },
  {
    title: 'Appointment Booking',
    subtitle: 'Book, reschedule, and confirm through voice or chat.',
    bullets: [
      'Capture customer details cleanly',
      'Create/modify appointments via tools',
      'Send confirmations and reminders',
    ],
    outcomes: ['Fewer no-shows', 'Higher conversion', 'Less manual work'],
  },
  {
    title: 'Lead Qualification',
    subtitle: 'Capture and route leads with structured intake.',
    bullets: [
      'Ask qualifying questions automatically',
      'Score and route leads to the right team',
      'Push to CRM via webhook/tool',
    ],
    outcomes: ['More qualified leads', 'Faster routing', 'Cleaner CRM'],
  },
  {
    title: 'Order & Status Updates',
    subtitle: 'Automate “where is my order?” and status requests.',
    bullets: [
      'Check order status via tool/webhook',
      'Provide proactive updates when needed',
      'Deflect repetitive inbound queries',
    ],
    outcomes: ['Less inbound volume', 'Better CX', 'Faster resolution'],
  },
];

export function UseCasesPage() {
  return (
    <section className="py-14 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Use cases</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Proven patterns you can launch quickly. Start simple and extend with tools, webhooks,
          and tenant-scoped policies.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {cases.map((c) => (
          <div key={c.title} className="rounded-2xl border bg-background p-6">
            <div className="text-xl font-semibold tracking-tight">{c.title}</div>
            <div className="mt-1 text-sm text-muted-foreground">{c.subtitle}</div>

            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {c.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-foreground/60" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-2">
              {c.outcomes.map((o) => (
                <span
                  key={o}
                  className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                >
                  {o}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border bg-background p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Want a tailored workflow?</div>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Tell us your industry and channels. We’ll propose an agent flow and the tools to
              integrate with your systems.
            </p>
          </div>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90 transition"
          >
            Request demo
          </Link>
        </div>
      </div>
    </section>
  );
}

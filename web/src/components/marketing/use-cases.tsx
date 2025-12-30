import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const useCases = [
  {
    title: 'Customer Support',
    desc: 'Automate FAQs, ticket creation, and escalation with consistent quality.',
    points: ['Ticket creation', 'Context handoff', '24/7 coverage'],
  },
  {
    title: 'Appointment Booking',
    desc: 'Schedule, reschedule, and confirm appointments through voice or chat.',
    points: ['Calendar actions', 'Reminders', 'No-shows reduced'],
  },
  {
    title: 'Lead Qualification',
    desc: 'Capture, qualify, and route leads with structured data collection.',
    points: ['Forms & calls', 'Scoring', 'CRM-ready payloads'],
  },
  {
    title: 'Order & Status Updates',
    desc: 'Answer “Where is my order?” and status questions with clean automation.',
    points: ['Status lookups', 'Proactive updates', 'Lower support load'],
  },
];

export function UseCases() {
  return (
    <Section>
      <Container>
        {/* Header */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Use cases
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Start with proven workflows. Extend with tools and webhooks as your product scales.
            </p>
          </div>

          <Button asChild variant="outline" className="hidden md:inline-flex">
            <Link href="/use-cases">View all</Link>
          </Button>
        </div>

        {/* Grid */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {useCases.map((u) => (
            <div
              key={u.title}
              className="rounded-2xl border bg-background p-6"
            >
              <div className="text-xl font-semibold tracking-tight">
                {u.title}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {u.desc}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {u.points.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

import Link from 'next/link';
import { Button } from './Button';
import { Container } from './Container';
import { Section } from './Section';

const useCases = [
  {
    title: 'Customer Support',
    desc: 'Automate FAQs, ticket creation, and escalation with consistent quality.',
    points: ['Ticket creation', 'Context handoff'],
  },
  {
    title: 'Appointment Booking',
    desc: 'Schedule, reschedule, and confirm appointments through voice or chat.',
    points: ['Calendar actions', 'Reminders'],
  },
  {
    title: 'Lead Qualification',
    desc: 'Capture, qualify, and route leads with structured data collection.',
    points: ['Forms & calls', 'CRM-ready payloads'],
  },
  {
    title: 'Order & Status Updates',
    desc: 'Answer "Where is my order?" and status questions with clean automation.',
    points: ['Status lookups', 'Proactive updates'],
  },
];

export function UseCases() {
  return (
    <Section id="use-cases" className="scroll-mt-20">
      <Container>
        {/* Header */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-[#0F172A] md:text-3xl">
              Use cases
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[#475569]">
              Start with proven workflows. Extend with tools and webhooks as your product scales.
            </p>
          </div>

          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link href="/use-cases">View all</Link>
          </Button>
        </div>

        {/* Grid */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {useCases.map((u) => (
            <div
              key={u.title}
              className="group relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 transition-all hover:shadow-3xl hover:-translate-y-1"
            >
              <div className="text-xl font-bold text-[#0F172A]">
                {u.title}
              </div>
              <p className="mt-2 text-sm text-[#475569]">
                {u.desc}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {u.points.slice(0, 2).map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center rounded-full border border-[#CBD5E1] bg-white px-3 py-1 text-xs font-medium text-[#64748B]"
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

import { Container } from './Container';
import { Section } from './Section';

const outcomes = [
  {
    icon: '↓',
    title: 'Support Volume',
    description: 'Reduce repetitive inquiries',
  },
  {
    icon: '↑',
    title: 'Conversion',
    description: 'Higher conversion on inbound calls and chats',
  },
  {
    icon: '⚡',
    title: 'Faster Resolution',
    description: 'Instant responses and structured data capture',
  },
];

export function OutcomesStrip() {
  return (
    <Section className="py-12 md:py-16">
      <Container>
        <div className="grid gap-4 md:grid-cols-3">
          {outcomes.map((outcome) => (
            <div
              key={outcome.title}
              className="relative flex flex-col items-center rounded-[20px] bg-white bg-clip-border shadow-shadow-100 p-6 text-center transition-all hover:shadow-3xl hover:-translate-y-1"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl">
                <span className="text-2xl font-bold text-[#2563EB]">{outcome.icon}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-[#0F172A]">
                {outcome.title}
              </h3>
              <p className="mt-2 text-sm text-[#475569]">
                {outcome.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}

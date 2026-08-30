import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const steps = [
  { num: '01', title: 'Connect your business', desc: 'We learn your services, pricing, calendar, and how you want calls handled.' },
  { num: '02', title: 'Train your AI employee', desc: 'Denku is configured for your exact business — your voice, your scripts, your rules.' },
  { num: '03', title: 'Go live', desc: 'We test, you approve. Your AI employee goes live and starts answering immediately.' },
  { num: '04', title: 'Capture more revenue', desc: 'Every call answered, every lead qualified, every appointment booked — automatically.' },
];

export function HowItWorks() {
  return (
    <Section id="how" className="scroll-mt-20">
      <Container>
        <Reveal className="max-w-2xl">
          <div className="brand-eyebrow mb-5">The process</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[var(--s-ink)]">
            From zero to live in
            <br />
            <em className="font-medium italic text-[var(--s-accent)]">days</em>, not months.
          </h2>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-[var(--s-ink-soft)]">
            We handle the entire setup. You approve the result and start capturing the revenue you
            were losing.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.num} delay={(i % 4) as 0 | 1 | 2 | 3}>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--s-accent-ring)] font-display text-[15px] font-medium text-[var(--s-accent)]">
                {step.num}
              </div>
              <h3 className="font-display text-[18px] font-medium text-[var(--s-ink)]">{step.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-[var(--s-ink-soft)]">{step.desc}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}

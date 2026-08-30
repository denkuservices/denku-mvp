import { Check } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const oldWay = [
  { step: '1', label: 'Read a website full of claims', note: '' },
  { step: '2', label: 'Fill out a contact form', note: 'wait 24h' },
  { step: '3', label: 'Schedule a discovery call', note: 'wait 3 days' },
  { step: '4', label: 'Watch a generic demo', note: 'not yours' },
  { step: '5', label: 'Maybe see results', note: '2+ weeks' },
];

const denkuWay = [
  { label: 'Visit the website', note: 'now' },
  { label: 'Talk to an AI employee', note: 'instantly' },
  { label: 'Experience real results', note: '30 sec' },
  { label: 'Decide if it fits your business', note: 'today' },
];

export function WhyDenku() {
  return (
    <Section id="why" className="scroll-mt-20 border-y border-[var(--s-border)] bg-[var(--s-panel-2)]">
      <Container>
        <Reveal className="max-w-2xl">
          <div className="brand-eyebrow mb-5">The Denku difference</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[var(--s-ink)]">
            Experience it first.
            <br />
            Decide <em className="font-medium italic text-[var(--s-accent)]">today</em>.
          </h2>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-[var(--s-ink-soft)]">
            Most agencies make you wait days to see what AI can do. We let you experience it in the
            next 30 seconds — on this page.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Old way */}
          <Reveal className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-bg)] p-10">
            <div className="mb-7 border-b border-[var(--s-border)] pb-4 font-brand-mono text-xs tracking-wider text-[var(--s-ink-faint)]">
              // THE OLD WAY
            </div>
            <div className="space-y-1">
              {oldWay.map((s) => (
                <div key={s.step} className="flex items-center gap-3.5 py-3 text-[15px] text-[var(--s-ink-faint)]">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--s-panel-3)] text-xs text-[var(--s-ink-faint)]">
                    {s.step}
                  </span>
                  {s.label}
                  {s.note && <span className="ml-auto font-brand-mono text-[11px] text-[var(--s-ink-faint)]">{s.note}</span>}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Denku way */}
          <Reveal delay={1} className="rounded-[18px] border border-[var(--s-border)] bg-[var(--s-cta-bg)] p-10 brand-shadow-lg">
            <div className="mb-7 border-b border-white/10 pb-4 font-brand-mono text-xs tracking-wider text-[var(--s-accent-deep)]">
              // THE DENKU WAY
            </div>
            <div className="space-y-1">
              {denkuWay.map((s) => (
                <div key={s.label} className="flex items-center gap-3.5 py-3 text-[15px] text-[var(--s-cta-fg)]">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--s-accent)] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  {s.label}
                  <span className="ml-auto font-brand-mono text-[11px] text-[var(--s-accent-deep)]">{s.note}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

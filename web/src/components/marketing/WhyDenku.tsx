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
    <Section id="why" className="scroll-mt-20 border-y border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
      <Container>
        <Reveal className="max-w-2xl">
          <div className="brand-eyebrow mb-5">The Denku difference</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
            Experience it first.
            <br />
            Decide <em className="font-medium italic text-[#1B6E6E]">today</em>.
          </h2>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-[#2C3E54]">
            Most agencies make you wait days to see what AI can do. We let you experience it in the
            next 30 seconds — on this page.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Old way */}
          <Reveal className="rounded-[18px] border border-[#0A1A2F]/10 bg-[#F7F5F1] p-10">
            <div className="mb-7 border-b border-[#0A1A2F]/10 pb-4 font-brand-mono text-xs tracking-wider text-[#6B7888]">
              // THE OLD WAY
            </div>
            <div className="space-y-1">
              {oldWay.map((s) => (
                <div key={s.step} className="flex items-center gap-3.5 py-3 text-[15px] text-[#6B7888]">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#EFEBE4] text-xs text-[#6B7888]">
                    {s.step}
                  </span>
                  {s.label}
                  {s.note && <span className="ml-auto font-brand-mono text-[11px] text-[#6B7888]">{s.note}</span>}
                </div>
              ))}
            </div>
          </Reveal>

          {/* Denku way */}
          <Reveal delay={1} className="rounded-[18px] border border-[#0A1A2F] bg-[#0A1A2F] p-10 brand-shadow-lg">
            <div className="mb-7 border-b border-white/10 pb-4 font-brand-mono text-xs tracking-wider text-[#3FA3A3]">
              // THE DENKU WAY
            </div>
            <div className="space-y-1">
              {denkuWay.map((s) => (
                <div key={s.label} className="flex items-center gap-3.5 py-3 text-[15px] text-[#F7F5F1]/90">
                  <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-[#1B6E6E] text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  {s.label}
                  <span className="ml-auto font-brand-mono text-[11px] text-[#3FA3A3]">{s.note}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

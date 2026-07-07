import { PhoneCall, Clock, Target, CalendarCheck, Link2, FileText, TrendingUp, Zap } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const benefits = [
  { icon: PhoneCall, title: 'Zero missed calls', desc: 'Every call answered in under a second — evenings, weekends, holidays.' },
  { icon: Clock, title: '24/7 availability', desc: 'Your AI employee works every hour you can\'t.' },
  { icon: Target, title: 'Qualified leads only', desc: 'Denku asks the right questions so your team talks to serious buyers.' },
  { icon: CalendarCheck, title: 'Appointments auto-booked', desc: 'Straight into your calendar, confirmed on the call.' },
  { icon: Link2, title: 'CRM integration', desc: 'Every lead, call, and booking synced to your existing tools.' },
  { icon: FileText, title: 'Instant call summaries', desc: 'Every call transcribed, summarized, and sent to your inbox.' },
  { icon: TrendingUp, title: 'Revenue you were losing', desc: 'The average business misses 35% of inbound calls. That stops now.' },
  { icon: Zap, title: 'First to respond wins', desc: 'Denku answers before your competitors even pick up.' },
];

export function OutcomesStrip() {
  return (
    <Section id="benefits" className="scroll-mt-20 border-t border-[#0A1A2F]/[0.06] bg-[#FBFAF8]">
      <Container>
        <Reveal className="max-w-2xl">
          <div className="brand-eyebrow mb-5">What you get</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
            What happens when
            <br />
            every call gets <em className="font-medium italic text-[#1B6E6E]">answered</em>.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <Reveal
                key={b.title}
                delay={(i % 4) as 0 | 1 | 2 | 3}
                className="flex items-start gap-4 rounded-[14px] border border-[#0A1A2F]/[0.06] bg-[#F7F5F1] p-7"
              >
                <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-[#E3EEED] text-[#134F4F]">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <div className="font-display text-[17px] font-medium text-[#0A1A2F]">{b.title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#2C3E54]">{b.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

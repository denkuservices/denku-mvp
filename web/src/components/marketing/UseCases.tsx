import { Phone, Calendar, Target, RefreshCw, MessageSquare, Zap } from 'lucide-react';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';

const services = [
  {
    icon: Phone,
    title: 'AI Voice Receptionist',
    desc: 'Answers every call on the first ring, around the clock. Handles questions, takes messages, and routes calls like a trained front-desk professional.',
  },
  {
    icon: Calendar,
    title: 'AI Appointment Booking',
    desc: 'Books appointments directly into your calendar during the call — no back-and-forth, no hold music, no dropped bookings.',
  },
  {
    icon: Target,
    title: 'AI Lead Qualification',
    desc: 'Asks the right questions, scores each caller by urgency and value, and routes only your best opportunities to the team.',
  },
  {
    icon: RefreshCw,
    title: 'AI Customer Follow-Up',
    desc: 'Automatically follows up on estimates, quotes, and reminders so no potential job slips through the cracks.',
  },
  {
    icon: MessageSquare,
    title: 'AI Customer Support',
    desc: 'Resolves FAQs, scheduling changes, and status requests — handling most issues without ever escalating to your team.',
  },
  {
    icon: Zap,
    title: 'Custom AI Automations',
    desc: 'CRM sync, call summaries, SMS follow-ups, reputation management — we automate the entire workflow around every call.',
  },
];

export function UseCases() {
  return (
    <Section id="services" className="scroll-mt-20">
      <Container>
        <Reveal className="max-w-2xl">
          <div className="brand-eyebrow mb-5">What we build</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#0A1A2F]">
            AI employees for the
            <br />
            moments that <em className="font-medium italic text-[#1B6E6E]">cost</em> you revenue.
          </h2>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-[#2C3E54]">
            Not chatbots. Not scripts. Trained AI team members that handle calls, leads, and
            bookings exactly the way your best employee would.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal
                key={s.title}
                delay={(i % 3) as 0 | 1 | 2}
                className="group rounded-[18px] border border-[#0A1A2F]/[0.06] bg-[#FBFAF8] p-8 transition-all duration-300 hover:-translate-y-1 hover:border-[#1B6E6E]/20 hover:brand-shadow-md"
              >
                <div className="mb-6 flex h-[50px] w-[50px] items-center justify-center rounded-[12px] bg-[#E3EEED] text-[#134F4F]">
                  <Icon className="h-[22px] w-[22px]" />
                </div>
                <h3 className="font-display text-[22px] font-medium tracking-[-0.4px] text-[#0A1A2F]">{s.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[#2C3E54]">{s.desc}</p>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}

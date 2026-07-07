import Link from 'next/link';
import { Container } from './Container';
import { Section } from './Section';
import { Reveal } from './Reveal';
import { DemoCallButton } from './DemoCallButton';

export function DemoCallout() {
  return (
    <Section className="bg-[#0A1A2F]">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          {/* Mini robot face */}
          <div
            className="brand-float mx-auto mb-7 flex h-[70px] w-[70px] items-center justify-center gap-2.5 rounded-[22px_22px_20px_20px] bg-gradient-to-b from-white to-[#EAE6DE]"
            style={{ boxShadow: '0 0 0 8px rgba(27,110,110,0.10)' }}
          >
            <span className="h-[11px] w-[11px] rounded-full bg-[#1B6E6E]" style={{ boxShadow: '0 0 8px rgba(27,110,110,0.6)' }} />
            <span className="h-[11px] w-[11px] rounded-full bg-[#1B6E6E]" style={{ boxShadow: '0 0 8px rgba(27,110,110,0.6)' }} />
          </div>

          <div className="brand-eyebrow centered mb-5 justify-center">Meet Denku</div>
          <h2 className="font-display text-[clamp(32px,3.8vw,50px)] font-normal leading-[1.08] tracking-[-1.2px] text-[#F7F5F1]">
            Don&apos;t just read about it.
            <br />
            Talk to it <em className="font-medium italic text-[#3FA3A3]">right now</em>.
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[18px] leading-relaxed text-[#F7F5F1]/70">
            Ask Denku how it would handle calls for your business. It&apos;s live, trained, and ready
            to take the conversation.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-5 sm:flex-row">
            <DemoCallButton />
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-[10px] border border-[#F7F5F1]/25 px-7 py-3.5 text-[15px] font-medium text-[#F7F5F1] transition-all hover:border-[#F7F5F1]/50"
            >
              Book a real demo
            </Link>
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}

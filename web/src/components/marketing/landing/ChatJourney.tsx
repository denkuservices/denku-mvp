import { ArrowRight, Inbox, Sparkles, TicketCheck } from "lucide-react";
import { ChannelIcon } from "./ChannelIcon";
import { Reveal } from "./primitives";

export type ChatJourneyCopy = {
  eyebrow: string;
  headline: string;
  sub: string;
  steps: Array<{ title: string; body: string }>;
};

const STEP_ICONS = [Inbox, Sparkles, TicketCheck];

export function ChatJourney({ copy }: { copy: ChatJourneyCopy }) {
  return (
    <section className="relative w-full px-6 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="grid gap-6 md:grid-cols-[.8fr_1.2fr] md:items-end">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            {copy.eyebrow}
          </div>
          <div>
            <h2 className="font-display text-[clamp(30px,4vw,50px)] font-semibold leading-[1.02] tracking-[-.025em] text-[var(--d-ink)]">
              {copy.headline}
            </h2>
            <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
              {copy.sub}
            </p>
          </div>
        </Reveal>

        <div className="relative mt-10 grid gap-3 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute left-[16%] right-[16%] top-8 hidden h-px md:block"
            style={{ background: "linear-gradient(90deg, transparent, rgba(200,148,104,.4), transparent)" }}
          />
          {copy.steps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Sparkles;
            return (
              <Reveal key={step.title} delay={index * 90}>
                <article className="landing-glass relative flex h-full min-h-[210px] flex-col p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[rgba(200,148,104,.22)] bg-[rgba(200,148,104,.09)] text-[var(--d-copper)]">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="font-brand-mono text-[9px] tracking-[.16em] text-[var(--d-ink-faint)]">
                      0{index + 1}
                    </span>
                  </div>
                  {index === 0 && (
                    <div className="mt-5 flex -space-x-2">
                      {['telegram', 'email', 'webchat'].map((channel) => (
                        <ChannelIcon key={channel} channel={channel} size="sm" className="ring-4 ring-[#0D1818]" />
                      ))}
                    </div>
                  )}
                  {index === 1 && (
                    <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--d-teal)]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--d-teal)] [animation-delay:160ms]" />
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--d-teal)] [animation-delay:320ms]" />
                    </div>
                  )}
                  {index === 2 && (
                    <div className="mt-6 flex items-center gap-2 text-[10px] text-[var(--d-success)]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(127,201,143,.12)]">✓</span>
                      <span className="h-px flex-1 bg-[rgba(127,201,143,.22)]" />
                    </div>
                  )}
                  <h3 className="mt-auto pt-5 font-display text-[21px] font-semibold text-[var(--d-ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--d-ink-soft)]">{step.body}</p>
                  {index < copy.steps.length - 1 && (
                    <span className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 items-center justify-center rounded-full border border-[var(--d-border)] bg-[var(--d-bg)] text-[var(--d-copper)] md:flex">
                      <ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </span>
                  )}
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ChatJourney;

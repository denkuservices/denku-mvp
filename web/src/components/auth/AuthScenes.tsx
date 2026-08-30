"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/**
 * The rotating story on the auth panel.
 *
 * The benchmark's client portal does this well (client.creato.digital/login):
 * three numbered scenes of the product working, cycling beside the form. It sells
 * while you sign in, and it makes an empty login screen carry weight.
 *
 * Denku's three beats are its own loop rather than a generic feature list —
 * a call that would have been lost, the booking it became, and the customer the
 * system now remembers. Same three beats as the homepage's workday story, which
 * is the point: someone arriving from the site sees the argument continue.
 *
 * Every card is real product shape with obviously-sampled data. No invented
 * metrics — the numbers here describe the scene, not Denku's traction.
 */

const SCENES = [
  {
    n: "1",
    caption: "The call you'd have missed",
    note: "After hours, mid-job, or already on the line — it still gets answered.",
    render: () => (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--d-border)] bg-[var(--d-bg-raised)] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <span className="landing-pulse relative h-2 w-2 rounded-full bg-[var(--d-success)]" />
            <div>
              <div className="text-[13.5px] font-medium text-[var(--d-ink)]">
                Incoming call
              </div>
              <div className="font-brand-mono text-[10.5px] text-[var(--d-ink-faint)]">
                (321) ••• ••42 · 6:04 PM
              </div>
            </div>
          </div>
          <span className="rounded-full border border-[rgba(200,148,104,.3)] bg-[rgba(200,148,104,.10)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.12em] text-[var(--d-copper)]">
            You&apos;re closed
          </span>
        </div>
        <div className="rounded-2xl border border-[rgba(47,163,154,.24)] bg-[rgba(47,163,154,.10)] px-4 py-3.5">
          <div className="font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-teal)]">
            Denku picked up
          </div>
          <div className="mt-1.5 text-[13.5px] text-[var(--d-ink-soft)]">
            &ldquo;Thanks for calling — how can I help this evening?&rdquo;
          </div>
        </div>
      </div>
    ),
  },
  {
    n: "2",
    caption: "It books the job itself",
    note: "The conversation becomes an appointment request, written while you're away.",
    render: () => (
      <div className="flex flex-col gap-2.5">
        <div className="self-start max-w-[80%] rounded-2xl border border-[var(--d-border)] bg-[var(--d-surface-glass)] px-3.5 py-2 text-[13px] text-[var(--d-ink-soft)]">
          Do you have anything Thursday?
        </div>
        <div className="self-end max-w-[80%] rounded-2xl border border-[rgba(47,163,154,.24)] bg-[rgba(47,163,154,.16)] px-3.5 py-2 text-[13px] text-[var(--d-ink)]">
          9:30am or 2pm — which suits?
        </div>
        <div className="self-start max-w-[80%] rounded-2xl border border-[var(--d-border)] bg-[var(--d-surface-glass)] px-3.5 py-2 text-[13px] text-[var(--d-ink-soft)]">
          9:30 works.
        </div>
        <div className="mt-1.5 flex items-center gap-2.5 rounded-xl border border-[rgba(200,148,104,.34)] bg-[rgba(200,148,104,.08)] px-3.5 py-2.5">
          <span className="font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-copper)]">
            Appointment
          </span>
          <span className="text-[12.5px] text-[var(--d-ink-soft)]">Thu 9:30am · created</span>
        </div>
      </div>
    ),
  },
  {
    n: "3",
    caption: "It never forgets a customer",
    note: "Every call joins a contact's history, so the next one starts from something.",
    render: () => (
      <div className="rounded-2xl border border-[var(--d-border)] bg-[var(--d-bg-raised)] p-4">
        <div className="mb-3 flex items-center gap-3 border-b border-[var(--d-border)] pb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--d-border)] bg-[var(--d-surface-glass)] text-[12px] text-[var(--d-ink-soft)]">
            DM
          </div>
          <div>
            <div className="text-[13.5px] font-semibold text-[var(--d-ink)]">Dana M.</div>
            <div className="font-brand-mono text-[10px] text-[var(--d-ink-faint)]">
              4th call · since March
            </div>
          </div>
        </div>
        <ol className="flex flex-col gap-2.5 pl-3.5">
          {[
            ["Mar 4", "Called about a leak"],
            ["Mar 6", "Booked Thu 9:30am"],
            ["Today", "Greeted by name"],
          ].map(([when, what], i) => (
            <li key={when} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-3.5 top-[7px] h-[6px] w-[6px] rounded-full"
                style={{ background: i === 2 ? "var(--d-copper)" : "var(--d-teal)" }}
              />
              <div className="font-brand-mono text-[9.5px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
                {when}
              </div>
              <div className="text-[12.5px] text-[var(--d-ink-soft)]">{what}</div>
            </li>
          ))}
        </ol>
      </div>
    ),
  },
];

export function AuthScenes() {
  const t = useTranslations("auth");
  const copy = t.raw("scenes") as { caption: string; note: string }[];
  const [i, setI] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) return;
    const id = setInterval(() => setI((n) => (n + 1) % SCENES.length), 5200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full w-full flex-col justify-center px-10 lg:px-14">
      <div className="relative min-h-[260px] w-full max-w-[420px]">
        {SCENES.map((s, idx) => {
          const active = reduced ? idx === 0 : idx === i;
          return (
            <div
              key={s.n}
              className="absolute inset-x-0 top-0"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "none" : "translateY(12px)",
                transition: reduced ? "none" : "opacity .6s ease, transform .6s ease",
                pointerEvents: active ? "auto" : "none",
              }}
              aria-hidden={!active}
            >
              {s.render()}
            </div>
          );
        })}
      </div>

      <div className="mt-9 max-w-[420px]">
        <div className="relative min-h-[74px]">
          {SCENES.map((s, idx) => {
            const active = reduced ? idx === 0 : idx === i;
            return (
              <div
                key={s.n}
                className="absolute inset-x-0 top-0"
                style={{
                  opacity: active ? 1 : 0,
                  transition: reduced ? "none" : "opacity .5s ease",
                }}
                aria-hidden={!active}
              >
                <div className="font-display text-[19px] font-semibold text-[var(--d-ink)]">
                  <span className="text-[var(--d-copper)]">{s.n}.</span>{" "}
                  {copy[idx]?.caption ?? s.caption}
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--d-ink-soft)]">
                  {copy[idx]?.note ?? s.note}
                </p>
              </div>
            );
          })}
        </div>

        {!reduced && (
          <div className="mt-5 flex gap-2">
            {SCENES.map((s, idx) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`${s.n}: ${copy[idx]?.caption ?? s.caption}`}
                className="h-[2px] w-10 rounded-full transition-colors"
                style={{
                  background: idx === i ? "var(--d-copper)" : "var(--d-border)",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthScenes;

"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useInView, usePrefersReducedMotion } from "./primitives";

/**
 * The Employee Card — doc-17 signature #1, and Denku's answer to the benchmark's
 * logo-geometry showpiece (doc 06). A badge for an AI employee: glyph, name, role,
 * an "On shift" pulse, and a ticker of what it has been doing.
 *
 * On first view it materialises: fragments of real conversation drift inward and
 * converge into the badge. The metaphor is the product's own — an employee that is
 * assembled out of the conversations it handles.
 *
 * Reused verbatim in the hero and in the template gallery, which is the point:
 * a signature has to repeat to become one.
 */

export type EmployeeCardProps = {
  name: string;
  role: string;
  glyph: string;
  /** Rotating line under the name — what this employee just did. */
  ticker?: string[];
  /** Conversation fragments that converge into the badge. Hero only. */
  fragments?: string[];
  className?: string;
};

const DEFAULT_FRAGMENTS = [
  "Can you fit us in Thursday?",
  "Missed call · 6:04pm",
  "What are your hours?",
  "Booked · Tue 9:30am",
  "Do you cover 90210?",
];

export function EmployeeCard({
  name,
  role,
  glyph,
  ticker,
  fragments,
  className = "",
}: EmployeeCardProps) {
  const t = useTranslations("employeeCard");
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.25 });
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;
  const frags = fragments ?? (fragments === undefined ? DEFAULT_FRAGMENTS : []);

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!ticker || ticker.length < 2 || reduced) return;
    const id = setInterval(() => setTick((t) => (t + 1) % ticker.length), 3200);
    return () => clearInterval(id);
  }, [ticker, reduced]);

  // Fixed scatter positions so the animation is identical on every render —
  // random offsets would make the hero look different on each visit.
  const scatter = [
    { x: -132, y: -84 },
    { x: 128, y: -52 },
    { x: -118, y: 74 },
    { x: 136, y: 92 },
    { x: -8, y: -128 },
  ];

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Converging conversation fragments */}
      {!reduced &&
        frags.map((f, i) => {
          const s = scatter[i % scatter.length];
          return (
            <span
              key={f}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 hidden whitespace-nowrap rounded-full border border-[var(--d-border)] bg-[var(--d-bg-raised)] px-3 py-1.5 font-brand-mono text-[10.5px] text-[var(--d-ink-faint)] sm:block"
              style={{
                transform: shown
                  ? "translate(-50%, -50%) scale(.85)"
                  : `translate(calc(-50% + ${s.x}px), calc(-50% + ${s.y}px)) scale(1)`,
                opacity: shown ? 0 : 0.9,
                transition: `transform 1.15s cubic-bezier(.16,1,.3,1) ${240 + i * 90}ms, opacity .9s ease ${420 + i * 90}ms`,
              }}
            >
              {f}
            </span>
          );
        })}

      {/* The badge */}
      <div
        className="landing-glass relative z-10 w-full max-w-[330px] p-6"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "none" : "scale(.94)",
          transition: reduced
            ? "none"
            : "opacity .8s ease 900ms, transform .9s cubic-bezier(.16,1,.3,1) 900ms",
        }}
      >
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[19px]"
            style={{
              background: "linear-gradient(150deg, rgba(47,163,154,.24), rgba(200,148,104,.16))",
              border: "1px solid var(--d-border)",
            }}
            aria-hidden="true"
          >
            {glyph}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[19px] font-semibold leading-tight text-[var(--d-ink)]">
              {name}
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--d-ink-soft)]">{role}</div>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(127,201,143,.28)] bg-[rgba(127,201,143,.10)] px-2.5 py-1 font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-success)]">
            <span className="landing-pulse relative h-[5px] w-[5px] rounded-full bg-[var(--d-success)]" />
            {t("onShift")}
          </span>
        </div>

        {ticker && ticker.length > 0 && (
          <div className="mt-5 border-t border-[var(--d-border)] pt-4">
            <div className="font-brand-mono text-[9.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
              {t("justNow")}
            </div>
            <div className="relative mt-1.5 h-[20px] overflow-hidden">
              {ticker.map((line, i) => (
                <div
                  key={line}
                  className="absolute inset-x-0 top-0 truncate text-[13.5px] text-[var(--d-ink-soft)]"
                  style={{
                    transform: reduced
                      ? "none"
                      : `translateY(${(i - tick) * 20}px)`,
                    opacity: reduced ? (i === 0 ? 1 : 0) : i === tick ? 1 : 0,
                    transition: "transform .5s cubic-bezier(.2,.8,.2,1), opacity .4s ease",
                  }}
                  aria-hidden={reduced ? i !== 0 : i !== tick}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmployeeCard;

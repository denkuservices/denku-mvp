"use client";

import {
  PLACEHOLDER_METRICS,
  placeholderProps,
  type PlaceholderMetricId,
} from "@/lib/marketing/placeholderMetrics";
import { CountUp, Reveal } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * Proof strip — plan §5 row 2. The reference put `2.8B+ / 500K+ / 445K+` here;
 * this is the same shape with the honesty problem quarantined.
 *
 * Every figure comes from `PLACEHOLDER_METRICS` and renders with
 * `data-placeholder="true"`, so the launch check can find all of them with one
 * selector. See `docs/LAUNCH_RUNBOOK.md` — clearing this registry is a blocking
 * go-live item.
 *
 * The last cell is deliberately not a number: an always-true statement costs
 * nothing to keep and anchors the row in something real.
 */

const SHOWN: PlaceholderMetricId[] = [
  "callsAnswered",
  "appointmentsBooked",
  "responseTime",
];

export function ProofStrip() {
  const t = useTranslations("home.proof");

  return (
    <section className="relative w-full px-6 py-16 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)] md:grid-cols-4">
          {SHOWN.map((id, i) => {
            const m = PLACEHOLDER_METRICS[id];
            return (
              <Reveal
                key={id}
                delay={i * 90}
                className="flex flex-col gap-1.5 bg-[var(--d-bg)] px-6 py-8 text-center"
              >
                <CountUp
                  value={m.value}
                  className="font-display text-[clamp(28px,3.2vw,40px)] font-semibold leading-none text-[var(--d-ink)]"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                  {...placeholderProps(id)}
                />
                <span className="font-brand-mono text-[10.5px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]">
                  {t(id)}
                </span>
              </Reveal>
            );
          })}

          <Reveal
            delay={270}
            className="flex flex-col justify-center gap-1.5 bg-[var(--d-bg)] px-6 py-8 text-center"
          >
            <span className="font-display text-[clamp(28px,3.2vw,40px)] font-semibold leading-none text-[var(--d-teal)]">
              24/7
            </span>
            <span className="font-brand-mono text-[10.5px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]">
              {t("neverOff")}
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default ProofStrip;

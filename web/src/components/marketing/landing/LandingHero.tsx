"use client";

import { Link } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { EmployeeCard } from "./EmployeeCard";
import { Magnetic, RotatingOutcome, SplitHeading } from "./primitives";
import { SignalFieldFallback } from "./SignalField";
import { useTranslations } from "next-intl";

/**
 * Hero — plan §5 row 1.
 *
 * Four staged layers, the composition borrowed from the reference and the palette
 * deliberately not: the signal field sits furthest back, the Employee Card in the
 * mid-ground, the type in front, and a hairline floor closes the frame.
 *
 * Copy budget is 22 words. The headline is five.
 */

// The shader is the one thing here that must not block first paint.
const SignalField = dynamic(() => import("./SignalField"), {
  ssr: false,
  loading: () => <SignalFieldFallback />,
});

export function LandingHero() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const outcomes = t.raw("outcomes") as string[];

  return (
    <section
      id="top"
      className="relative flex min-h-[92vh] w-full items-center overflow-hidden"
    >
      <SignalField />

      {/* Hairline floor — closes the frame the way the reference's grid plane does. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--d-border) 15%, var(--d-border) 85%, transparent)",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:px-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
        <div>
          <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-[var(--d-border)] bg-[var(--d-surface-glass)] px-3.5 py-1.5 font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-soft)]">
            <span className="landing-pulse relative h-[5px] w-[5px] rounded-full bg-[var(--d-teal)]" />
            {t("eyebrow")}
          </div>

          <SplitHeading
            text={t("headline")}
            emphasis={[t("headlineEmphasis")]}
            className="font-display text-[clamp(42px,6.4vw,86px)] font-semibold leading-[.95] tracking-[-.02em] text-[var(--d-ink)]"
          />

          <p className="mt-7 min-h-[1.6em] text-[19px] leading-relaxed text-[var(--d-ink-soft)]">
            <RotatingOutcome phrases={outcomes} />
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Magnetic>
              <Link
                href="#demo"
                className="landing-sweep inline-flex items-center gap-2.5 rounded-full bg-[var(--d-copper)] px-8 py-4 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C]"
              >
                {tc("talkToDenku")}
                <span aria-hidden="true">→</span>
              </Link>
            </Magnetic>
            <Link
              href="#pricing"
              className="inline-flex items-center rounded-full border border-[var(--d-border)] px-7 py-4 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
            >
              {tc("seePricing")}
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <EmployeeCard
            name="Ava"
            role="Receptionist · Voice"
            glyph="◍"
            ticker={[
              "Booked a 9:30am estimate",
              "Texted back a missed call",
              "Logged a new contact",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

export default LandingHero;

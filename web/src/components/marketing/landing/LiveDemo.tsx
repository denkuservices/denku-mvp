"use client";

import * as React from "react";
import SplineClient from "@/components/marketing/SplineClient";
import { DemoCallButton, type CallState } from "@/components/marketing/DemoCallButton";
import { Reveal, useInView, usePrefersReducedMotion } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * Live demo — plan §5 row 3, and doc 18's W1: the one thing on this page that is
 * not a claim.
 *
 * The Spline employee lives HERE, directly above the call button, rather than in
 * the hero. That was the owner's call, and it is the better job for it: it stops
 * being decoration and becomes the face of the thing you are about to talk to.
 * The ring behind it reacts to the real Vapi state machine — idle drift, a faster
 * seeking pulse while connecting, and a steady copper listening ring once live.
 *
 * The Spline runtime is heavy (scene measured at 1.29 MB, plus its own engine), so
 * it mounts only when this section scrolls into view — it is never on the hero's
 * critical path (plan §7 rules 2 and 3).
 */

const SPLINE_SCENE = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL || "";

const RING_STATE: Record<CallState, { color: string; key: string; speed: string }> = {
  idle: { color: "rgba(47,163,154,.34)", key: "ready", speed: "7s" },
  connecting: { color: "rgba(200,148,104,.55)", key: "connecting", speed: "1.6s" },
  live: { color: "rgba(200,148,104,.85)", key: "listening", speed: "2.6s" },
  error: { color: "rgba(226,105,92,.55)", key: "tryAgain", speed: "7s" },
};

export function LiveDemo() {
  const t = useTranslations("home.demo");
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.1, rootMargin: "200px" });
  const reduced = usePrefersReducedMotion();
  const [callState, setCallState] = React.useState<CallState>("idle");
  const ring = RING_STATE[callState];

  return (
    <section id="demo" className="relative w-full px-6 py-28 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-14 text-center">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
          <p className="mt-4 text-[17px] text-[var(--d-ink-soft)]">{t("sub")}</p>
        </Reveal>

        <div ref={ref} className="landing-sweep landing-glass mx-auto max-w-[560px] p-8 sm:p-10">
          <div className="relative mx-auto flex h-[360px] w-full items-center justify-center overflow-hidden rounded-2xl">
            {/* Reactive rings — the employee's state, made visible */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="absolute rounded-full border"
                  style={{
                    width: `${190 + i * 62}px`,
                    height: `${190 + i * 62}px`,
                    borderColor: ring.color,
                    opacity: 1 - i * 0.3,
                    animation: reduced
                      ? "none"
                      : `landingRingBreath ${ring.speed} ease-in-out ${i * 0.22}s infinite`,
                    transition: "border-color .6s ease",
                  }}
                />
              ))}
            </div>

            {inView && SPLINE_SCENE ? (
              <div className="relative h-full w-full">
                {/* Pool of light. The scene's employee is near-black, so on a
                    teal-black canvas it needs something to stand against —
                    a lit floor reads better than a grey box, and it is the same
                    "glow articulates the section" move the rest of the page uses. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse 46% 52% at 50% 58%, rgba(47,163,154,.30), transparent 68%)," +
                      "radial-gradient(ellipse 30% 22% at 50% 88%, rgba(247,245,241,.16), transparent 70%)",
                  }}
                />
                <SplineClient
                  scene={SPLINE_SCENE}
                  className="relative z-10"
                  onLoad={(app) => {
                    // Clear the scene's baked-in light background.
                    try {
                      app.setBackgroundColor?.("transparent");
                    } catch {
                      /* older runtimes ignore this; the pool of light still reads */
                    }
                  }}
                />
              </div>
            ) : (
              <div
                aria-hidden="true"
                className="relative h-[112px] w-[122px] rounded-[34px_34px_28px_28px]"
                style={{
                  background: "linear-gradient(180deg,#F7F5F1,#D9D4CA)",
                  boxShadow: "0 0 0 10px rgba(47,163,154,.10), 0 24px 60px rgba(0,0,0,.35)",
                }}
              />
            )}
          </div>

          <div className="mt-2 flex flex-col items-center gap-5">
            <span className="font-brand-mono text-[10.5px] uppercase tracking-[.18em] text-[var(--d-ink-faint)]">
              {t(ring.key)}
            </span>
            <DemoCallButton onStateChange={setCallState} />
          </div>
        </div>

        <Reveal delay={120} className="mt-8 text-center">
          <p className="font-brand-mono text-[12px] text-[var(--d-ink-faint)]">
            {t("footnote")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default LiveDemo;

"use client";

import * as React from "react";
import { Reveal, usePrefersReducedMotion } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * How hiring works — plan §5 row 4, doc 15 section 4.
 *
 * The four steps are joined by the Thread (doc-17 signature #2): one copper line
 * that draws itself as you scroll. The benchmark does this with GSAP's DrawSVG
 * plugin; the same effect is `stroke-dashoffset` driven by scroll progress, which
 * costs no library at all — worth it against a 300 KB budget that already spends
 * a shader and a Spline runtime.
 *
 * The Thread is the page's connective metaphor: it is the same line that carries a
 * missed call through to a booking later in the story.
 */

export function HowHiringWorks() {
  const t = useTranslations("home.how");
  const STEPS = (t.raw("steps") as { title: string; note: string }[]).map((s, i) => ({
    n: String(i + 1).padStart(2, "0"),
    ...s,
  }));
  const sectionRef = React.useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = React.useState(0);
  const reduced = usePrefersReducedMotion();

  React.useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    const el = sectionRef.current;
    if (!el) return;

    let raf = 0;
    let active = false;

    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the block's top reaches 85% of the viewport, 1 once its bottom
      // has risen past 55% — the line finishes drawing before it scrolls away.
      const start = vh * 0.85;
      const end = vh * 0.25;
      const raw = (start - r.top) / Math.max(1, r.height + start - end);
      setProgress(Math.min(1, Math.max(0, raw)));
    };
    const onScroll = () => {
      if (!active || raf) return;
      raf = requestAnimationFrame(measure);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          active = e.isIntersecting;
          if (active) measure();
        });
      },
      { threshold: 0 }
    );
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    measure();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <section id="how" className="relative w-full px-6 py-28 md:px-8">
      {/* The hinge: cinematic above, structured below. One continuous canvas —
          the shift is made with glow and nothing else (doc 06). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(47,163,154,.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <Reveal className="mb-16 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>

        <div ref={sectionRef} className="relative">
          {/* The Thread — horizontal on desktop, vertical on mobile */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
            preserveAspectRatio="none"
            viewBox="0 0 1000 120"
          >
            <path
              d="M 60 34 C 260 34, 240 96, 380 60 C 520 24, 500 96, 640 60 C 780 24, 800 34, 940 34"
              fill="none"
              stroke="var(--d-border)"
              strokeWidth="1"
            />
            <path
              d="M 60 34 C 260 34, 240 96, 380 60 C 520 24, 500 96, 640 60 C 780 24, 800 34, 940 34"
              fill="none"
              stroke="var(--d-copper)"
              strokeWidth="1.5"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
              style={{ transition: reduced ? "none" : "stroke-dashoffset .12s linear" }}
            />
          </svg>

          <ol className="relative grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4 md:gap-6">
            {STEPS.map((s, i) => {
              // Each step lights up as the thread reaches it.
              const lit = progress >= (i + 0.35) / STEPS.length;
              return (
                <li key={s.n} className="relative md:pt-32">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 hidden h-3 w-3 -translate-y-1/2 rounded-full border md:block"
                    style={{
                      top: i % 2 === 0 ? "34px" : "62px",
                      borderColor: lit ? "var(--d-copper)" : "var(--d-border)",
                      background: lit ? "var(--d-copper)" : "var(--d-bg)",
                      boxShadow: lit ? "0 0 0 5px rgba(200,148,104,.14)" : "none",
                      transition: "all .45s ease",
                    }}
                  />
                  <div
                    className="font-brand-mono text-[11px] tracking-[.16em]"
                    style={{
                      color: lit ? "var(--d-copper)" : "var(--d-ink-faint)",
                      transition: "color .45s ease",
                    }}
                  >
                    {s.n}
                  </div>
                  <h3 className="mt-3 font-display text-[20px] font-semibold leading-snug text-[var(--d-ink)]">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                    {s.note}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default HowHiringWorks;

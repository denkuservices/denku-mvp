"use client";

import { CrmScene, InboxScene, OutcomesScene } from "./ProductFrame";
import { useScrollProgress } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * The workday — plan §5 row 6, doc 18's W4. The page's set piece.
 *
 * Three scenes of the real product, pinned while you scroll through them: a call
 * becomes a booking, the contact remembers, and the week adds up. The benchmark
 * fakes this with invented dashboards; Denku's version renders its own surfaces
 * with the sample data labelled.
 *
 * Pinning is CSS `position: sticky` rather than a scroll library. Nothing is
 * scroll-jacked — the page scrolls at its natural speed and the scene inside the
 * pin cross-fades. Under reduced motion the progress hook returns 1, so all three
 * scenes are simply stacked and readable.
 */

const RENDERERS = [
  (r: number) => <InboxScene reveal={r} />,
  (r: number) => <CrmScene reveal={r} />,
  (r: number) => <OutcomesScene reveal={r} />,
];

export function Workday() {
  const t = useTranslations("home.workday");
  const SCENES = (t.raw("scenes") as { eyebrow: string; title: string; note: string }[]).map(
    (s, i) => ({ ...s, render: RENDERERS[i] })
  );
  const [ref, progress] = useScrollProgress<HTMLDivElement>();

  // Split the scroll into three equal acts, each with its own 0→1 reveal.
  const raw = progress * SCENES.length;
  const activeIndex = Math.min(SCENES.length - 1, Math.floor(raw));
  const localReveal = Math.min(1, (raw - activeIndex) * 1.6);

  return (
    <section id="workday" ref={ref} className="relative w-full" style={{ height: "300vh" }}>
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-6 md:px-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative min-h-[190px]">
            {SCENES.map((s, i) => {
              const active = i === activeIndex;
              return (
                <div
                  key={s.title}
                  className="absolute inset-0 flex flex-col justify-center"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "none" : "translateY(14px)",
                    transition: "opacity .5s ease, transform .5s ease",
                    pointerEvents: active ? "auto" : "none",
                  }}
                  aria-hidden={!active}
                >
                  <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
                    {s.eyebrow}
                  </div>
                  <h2 className="mt-4 font-display text-[clamp(30px,4vw,50px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
                    {s.title}
                  </h2>
                  <p className="mt-4 max-w-md text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
                    {s.note}
                  </p>
                </div>
              );
            })}

            {/* Act indicator — the Thread, ticked */}
            <div className="absolute bottom-0 left-0 flex gap-2">
              {SCENES.map((s, i) => (
                <span
                  key={s.title}
                  aria-hidden="true"
                  className="h-[2px] w-9 rounded-full"
                  style={{
                    background: i <= activeIndex ? "var(--d-copper)" : "var(--d-border)",
                    transition: "background .4s ease",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="relative min-h-[340px]">
            {SCENES.map((s, i) => {
              const active = i === activeIndex;
              return (
                <div
                  key={s.title}
                  className="absolute inset-0 flex items-center"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "none" : "scale(.975)",
                    transition: "opacity .5s ease, transform .5s ease",
                    pointerEvents: active ? "auto" : "none",
                  }}
                  aria-hidden={!active}
                >
                  <div className="w-full">{s.render(active ? localReveal : 0)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Workday;

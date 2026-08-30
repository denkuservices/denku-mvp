"use client";

import * as React from "react";

/**
 * Landing motion primitives.
 *
 * Deliberately dependency-free — IntersectionObserver plus rAF, no animation
 * library. The landing's JS budget (plan §7) is 300 KB gz for the whole first
 * load including the shader, so the small, repeated effects pay for themselves
 * in hand-written code. GSAP is reserved for the pinned scroll stories, which
 * are below the fold and dynamically imported.
 *
 * Every primitive here honours `prefers-reduced-motion` by rendering its final
 * state immediately rather than a slower version of the animation.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/** Fires once when the element first enters the viewport. */
export function useInView<T extends HTMLElement>(
  options?: IntersectionObserverInit
): [React.RefObject<T | null>, boolean] {
  const ref = React.useRef<T | null>(null);
  const [inView, setInView] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      });
    }, options ?? { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [options]);

  return [ref, inView];
}

/** Scroll reveal: a short rise + fade, staggerable by `delay`. */
export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  as?: React.ElementType;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(18px)",
        transition: reduced
          ? "none"
          : `opacity .7s cubic-bezier(.2,.8,.2,1) ${delay}ms, transform .7s cubic-bezier(.2,.8,.2,1) ${delay}ms`,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Word-by-word headline reveal. Words are real text in the DOM (plan §7 rule 7);
 * only their transform is animated, so the heading is selectable and readable to
 * assistive tech exactly as written.
 */
export function SplitHeading({
  text,
  className = "",
  emphasis,
  delay = 0,
}: {
  text: string;
  className?: string;
  /** Words rendered in the copper gradient — matched case-insensitively. */
  emphasis?: string[];
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLHeadingElement>({ threshold: 0.2 });
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;
  const emph = React.useMemo(
    () => new Set((emphasis ?? []).map((w) => w.toLowerCase())),
    [emphasis]
  );

  return (
    <h1 ref={ref} className={className}>
      {text.split(" ").map((word, i) => {
        const bare = word.replace(/[.,—]/g, "").toLowerCase();
        return (
          <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
            <span
              className={emph.has(bare) ? "landing-ember inline-block" : "inline-block"}
              style={{
                transform: shown ? "none" : "translateY(102%)",
                opacity: shown ? 1 : 0,
                transition: reduced
                  ? "none"
                  : `transform .85s cubic-bezier(.16,1,.3,1) ${delay + i * 55}ms, opacity .6s ease ${delay + i * 55}ms`,
              }}
            >
              {word}
            </span>
            {i < text.split(" ").length - 1 ? " " : null}
          </span>
        );
      })}
    </h1>
  );
}

/**
 * Rotating outcome line — the benchmark's typewriter (doc 07 #1), rotating real
 * outcomes rather than adjectives.
 *
 * The full list is rendered into a visually-hidden node so screen readers and
 * crawlers get every phrase, not just whichever one is mid-type.
 */
export function RotatingOutcome({
  phrases,
  className = "",
}: {
  phrases: string[];
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [shown, setShown] = React.useState(phrases[0] ?? "");

  React.useEffect(() => {
    if (reduced || phrases.length < 2) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const run = (i: number) => {
      const current = phrases[i];
      const next = phrases[(i + 1) % phrases.length];
      let step = 0;

      const erase = () => {
        if (cancelled) return;
        step += 1;
        setShown(current.slice(0, Math.max(0, current.length - step)));
        if (step >= current.length) {
          step = 0;
          timer = setTimeout(type, 90);
        } else {
          timer = setTimeout(erase, 26);
        }
      };
      const type = () => {
        if (cancelled) return;
        step += 1;
        setShown(next.slice(0, step));
        if (step >= next.length) {
          setIndex((i + 1) % phrases.length);
          timer = setTimeout(() => run((i + 1) % phrases.length), 2200);
        } else {
          timer = setTimeout(type, 42);
        }
      };

      timer = setTimeout(erase, 2200);
    };

    run(index);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `index` intentionally omitted: the loop advances itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases, reduced]);

  return (
    <span className={className}>
      <span aria-hidden="true">
        {reduced ? phrases[0] : shown}
        {!reduced && <span className="landing-caret" />}
      </span>
      <span className="sr-only">{phrases.join(". ")}</span>
    </span>
  );
}

/** Counts to a value when scrolled into view. Static under reduced motion. */
export function CountUp({
  value,
  duration = 1400,
  className = "",
  ...rest
}: {
  value: string;
  duration?: number;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = React.useState<string | null>(null);

  // Split "12,400+" into the number and whatever decorates it.
  const parsed = React.useMemo(() => {
    const m = value.match(/^([^\d]*)([\d.,]+)(.*)$/);
    if (!m) return null;
    const numeric = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(numeric)) return null;
    const decimals = m[2].includes(".") ? m[2].split(".")[1].length : 0;
    const grouped = m[2].includes(",");
    return { prefix: m[1], numeric, suffix: m[3], decimals, grouped };
  }, [value]);

  React.useEffect(() => {
    if (!inView || reduced || !parsed) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo — fast start, long settle, so the final value is readable.
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const n = parsed.numeric * eased;
      const body = parsed.grouped
        ? Math.round(n).toLocaleString("en-US")
        : n.toFixed(parsed.decimals);
      setDisplay(`${parsed.prefix}${body}${parsed.suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, parsed, duration]);

  return (
    <span ref={ref} className={className} {...rest}>
      {display ?? value}
    </span>
  );
}

/**
 * Magnetic hover — the element leans toward the cursor within its own bounds.
 * Fine pointers only, and disabled under reduced motion.
 */
export function Magnetic({
  children,
  strength = 0.28,
  className = "",
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const reduced = usePrefersReducedMotion();

  React.useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
    };
    const reset = () => {
      el.style.transform = "translate(0,0)";
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", reset);
    };
  }, [strength, reduced]);

  return (
    <span ref={ref} className={`inline-block will-change-transform ${className}`} style={{ transition: "transform .35s cubic-bezier(.2,.8,.2,1)" }}>
      {children}
    </span>
  );
}

/**
 * Progress of an element through the viewport, 0→1, sampled on scroll via rAF.
 * Returns 1 immediately under reduced motion so scroll-driven scenes render in
 * their final, readable state rather than frozen at the start.
 */
export function useScrollProgress<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number
] {
  const ref = React.useRef<T | null>(null);
  const [progress, setProgress] = React.useState(0);
  const reduced = usePrefersReducedMotion();

  React.useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let active = false;

    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const total = Math.max(1, r.height - vh);
      setProgress(Math.min(1, Math.max(0, -r.top / total)));
    };
    const onScroll = () => {
      if (!active || raf) return;
      raf = requestAnimationFrame(measure);
    };

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          active = e.isIntersecting;
          if (active) measure();
        }),
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

  return [ref, progress];
}

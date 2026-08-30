import Link from 'next/link';
import SplineClient from '@/components/marketing/SplineClient';
import { DemoCallButton } from '@/components/marketing/DemoCallButton';

const SPLINE_SCENE = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL || '';

export default function HeroPremium() {
  return (
    <section id="product" className="relative w-full overflow-hidden scroll-mt-20">
      {/* Ambient warm background */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[10%] right-[-5%] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(27,110,110,0.06)_0%,transparent_65%)]" />
        <div
          className="absolute inset-0 bg-[radial-gradient(rgba(10,26,47,0.04)_1px,transparent_1px)] [background-size:32px_32px]"
          style={{ maskImage: 'radial-gradient(ellipse 70% 60% at 60% 45%, black 0%, transparent 85%)', WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 60% 45%, black 0%, transparent 85%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-6 pb-24 pt-32 md:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* LEFT */}
        <div>
          <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] px-4 py-1.5 font-brand-mono text-xs font-medium tracking-wide text-[var(--s-accent-deep)]">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--s-accent)] pulse-dot" />
            AI EMPLOYEES · LIVE &amp; ANSWERING NOW
          </div>

          <h1 className="font-display text-[clamp(42px,5vw,68px)] font-normal leading-[1.04] tracking-[-2px] text-[var(--s-ink)]">
            The employee that{' '}
            <em className="font-medium italic text-[var(--s-accent)]">never</em>{' '}
            misses a call.
          </h1>

          <p className="mt-6 max-w-lg text-[19px] leading-relaxed text-[var(--s-ink-soft)]">
            Denku builds AI voice receptionists that answer every call, qualify every lead, and
            book every appointment — 24 hours a day, for businesses that can&apos;t afford to miss
            the phone.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3.5">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 rounded-[10px] bg-[var(--s-cta-bg)] px-7 py-4 text-[15px] font-medium text-[var(--s-cta-fg)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--s-accent)] hover:brand-shadow-md"
            >
              Book a demo
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2.5 rounded-[10px] border border-[var(--s-border)] bg-transparent px-7 py-4 text-[15px] font-medium text-[var(--s-ink)] transition-all duration-300 hover:border-[var(--s-accent)] hover:bg-[var(--s-panel-2)] hover:text-[var(--s-accent)]"
            >
              View pricing
            </Link>
          </div>

          {/* Trust strip */}
          <div className="mt-12 flex items-center gap-7 border-t border-[var(--s-border)] pt-9">
            {[
              { num: '24/7', label: 'Always answering' },
              { num: '<1s', label: 'Response time' },
              { num: '3×', label: 'More leads booked' },
            ].map((t, i) => (
              <div key={t.label} className="flex items-center gap-7">
                {i > 0 && <div className="h-10 w-px bg-[var(--s-hover-bg)]" />}
                <div>
                  <div className="font-display text-[30px] font-medium leading-none text-[var(--s-ink)]">{t.num}</div>
                  <div className="mt-1.5 text-xs font-medium text-[var(--s-ink-faint)]">{t.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Spline robot + Talk button */}
        <div className="flex flex-col items-center gap-7">
          <div className="relative h-[440px] w-full overflow-hidden rounded-[28px]">
            {/* Orbit rings */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="absolute h-[360px] w-[360px] rounded-full border border-[var(--s-accent-ring)]" style={{ animation: 'brandSpin 30s linear infinite' }} />
              <div className="absolute h-[300px] w-[300px] rounded-full border border-dashed border-[var(--s-ember)]" style={{ animation: 'brandSpin 22s linear infinite reverse' }} />
            </div>
            {SPLINE_SCENE ? (
              <SplineClient scene={SPLINE_SCENE} />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-brand-mono text-xs text-[var(--s-ink-faint)]">
                3D preview unavailable
              </div>
            )}
          </div>
          <DemoCallButton />
        </div>
      </div>
    </section>
  );
}

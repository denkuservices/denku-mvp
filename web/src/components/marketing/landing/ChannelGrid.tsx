"use client";

import { MARKETING_CHANNELS, type ChannelStatus } from "@/lib/marketing/content/channels";
import { Reveal } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * The channel roster, with each channel's real status on its face.
 *
 * The badge is the point. Every competitor in this category lists eight channels
 * and lets you assume all eight work; the honest version is more persuasive
 * precisely because the "Live" ones are then believable. A visitor who sees
 * "Beta — not included in any plan yet" trusts the "Live" badge next to Voice.
 */

const STATUS_STYLE: Record<ChannelStatus, { fg: string; bg: string; bd: string }> = {
  live: {
    fg: "var(--d-success)",
    bg: "rgba(127,201,143,.10)",
    bd: "rgba(127,201,143,.28)",
  },
  limited: {
    fg: "var(--d-copper)",
    bg: "rgba(200,148,104,.10)",
    bd: "rgba(200,148,104,.30)",
  },
  beta: {
    fg: "var(--d-ink-faint)",
    bg: "rgba(247,245,241,.04)",
    bd: "var(--d-border)",
  },
};

export function ChannelGrid() {
  const t = useTranslations("channels");
  const title = t("title");
  const note = t("note");

  return (
    <section id="channels" className="relative w-full px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {title}
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {MARKETING_CHANNELS.map((c, i) => {
            const s = STATUS_STYLE[c.status];
            return (
              <Reveal key={c.id} delay={i * 50}>
                <div
                  className="flex h-full flex-col gap-2 rounded-[16px] border p-5"
                  style={{
                    borderColor: c.status === "live" ? "var(--d-border)" : "var(--d-border)",
                    background:
                      c.status === "beta" ? "transparent" : "var(--d-surface-glass)",
                    opacity: c.status === "beta" ? 0.72 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-[17px] font-semibold text-[var(--d-ink)]">
                      {t(`items.${c.id}.label`)}
                    </span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-[3px] font-brand-mono text-[8.5px] uppercase tracking-[.14em]"
                      style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
                    >
                      {t(`status.${c.status}`)}
                    </span>
                  </div>
                  <p className="text-[13.5px] leading-snug text-[var(--d-ink-soft)]">
                    {t(`items.${c.id}.line`)}
                  </p>
                  {c.caveat && (
                    <p className="mt-auto pt-2 text-[12px] leading-snug text-[var(--d-ink-faint)]">
                      {c.status === "limited"
                        ? t(`items.${c.id}.caveat`)
                        : t("notInPlan")}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <p className="mt-6 font-brand-mono text-[12px] text-[var(--d-ink-faint)]">{note}</p>
        </Reveal>
      </div>
    </section>
  );
}

export default ChannelGrid;

"use client";

import { MARKETING_CHANNELS, type ChannelStatus } from "@/lib/marketing/content/channels";
import { Reveal } from "./primitives";
import { useTranslations } from "next-intl";
import { ChannelIcon } from "./ChannelIcon";

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

export function ChannelGrid({ includeVoice = true }: { includeVoice?: boolean }) {
  const t = useTranslations("channels");
  const title = t("title");
  const note = t("note");
  const channels = MARKETING_CHANNELS.filter((channel) => includeVoice || channel.id !== "voice");
  const availableChannels = channels.filter((channel) => channel.status !== "beta");
  const betaChannels = channels.filter((channel) => channel.status === "beta");

  return (
    <section id="channels" className="relative w-full overflow-hidden px-6 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
              {t("eyebrow")}
            </div>
            <h2 className="mt-4 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
              {title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["live", "limited", "beta"] as ChannelStatus[]).map((status) => {
              const count = channels.filter((channel) => channel.status === status).length;
              if (count === 0) return null;
              const style = STATUS_STYLE[status];
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-brand-mono text-[9px] uppercase tracking-[.12em]"
                  style={{ color: style.fg, background: style.bg, borderColor: style.bd }}
                >
                  <span>{count}</span>
                  {t(`status.${status}`)}
                </span>
              );
            })}
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {availableChannels.map((c, i) => {
            const s = STATUS_STYLE[c.status];
            return (
              <Reveal key={c.id} delay={i * 50}>
                <div
                  className="landing-glass group relative flex min-h-[220px] h-full flex-col overflow-hidden p-6"
                  style={{
                    borderColor: c.status === "limited" ? "rgba(200,148,104,.22)" : undefined,
                  }}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-50 blur-3xl transition-opacity duration-500 group-hover:opacity-90"
                    style={{ background: s.bg }}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <ChannelIcon channel={c.id} size="lg" />
                    <span
                      className="shrink-0 rounded-full border px-2 py-[3px] font-brand-mono text-[8.5px] uppercase tracking-[.14em]"
                      style={{ color: s.fg, background: s.bg, borderColor: s.bd }}
                    >
                      {t(`status.${c.status}`)}
                    </span>
                  </div>
                  <h3 className="mt-auto pt-7 font-display text-[22px] font-semibold text-[var(--d-ink)]">
                    {t(`items.${c.id}.label`)}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-snug text-[var(--d-ink-soft)]">
                    {t(`items.${c.id}.line`)}
                  </p>
                  {c.caveat && (
                    <p className="mt-4 border-t border-[var(--d-border)] pt-3 text-[11.5px] leading-snug text-[var(--d-ink-faint)]">
                      {t(`items.${c.id}.caveat`)}
                    </p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={180}>
          <div className="mt-4 flex flex-col gap-4 rounded-[18px] border border-dashed border-[var(--d-border)] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2.5">
              {betaChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center gap-2 rounded-full border border-[var(--d-border)] bg-[rgba(247,245,241,.025)] py-1.5 pl-1.5 pr-3"
                >
                  <ChannelIcon channel={channel.id} size="sm" muted />
                  <span className="text-[12px] font-medium text-[var(--d-ink-soft)]">
                    {t(`items.${channel.id}.label`)}
                  </span>
                  <span className="font-brand-mono text-[7.5px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
                    {t("status.beta")}
                  </span>
                </div>
              ))}
            </div>
            <p className="max-w-md font-brand-mono text-[10.5px] leading-relaxed text-[var(--d-ink-faint)] md:text-right">
              {note}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default ChannelGrid;

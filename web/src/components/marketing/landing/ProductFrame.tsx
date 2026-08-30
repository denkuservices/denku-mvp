"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/**
 * The real-UI frame — doc-17 signature #3.
 *
 * The benchmark illustrates its pages with idealised dashboards it does not have
 * (doc 06). Denku's move is the opposite: render the product's own surfaces, and
 * label the data honestly. The "Sample data" chip is not a disclaimer bolted on
 * afterwards — it is part of the frame, because being able to show the real thing
 * is the advantage.
 *
 * Device-free on purpose: no laptop bezel, no phone mockup. A glass window with a
 * hairline and a title bar reads as software rather than as stock photography.
 */
export function ProductFrame({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const sampleLabel = useTranslations("productFrame")("sampleData");

  return (
    <div
      className={`overflow-hidden rounded-[18px] border border-[var(--d-border)] bg-[var(--d-bg-raised)] ${className}`}
      style={{ boxShadow: "0 40px 90px -50px rgba(0,0,0,.9)" }}
    >
      <div className="flex items-center justify-between border-b border-[var(--d-border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[var(--d-border)]" />
          <span className="font-brand-mono text-[10.5px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]">
            {title}
          </span>
        </div>
        <span className="rounded-full border border-[var(--d-border)] px-2 py-0.5 font-brand-mono text-[9px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
          {sampleLabel}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** A conversation turning into an artifact — the Inbox. */
export function InboxScene({ reveal = 1 }: { reveal?: number }) {
  const t = useTranslations("productFrame");
  const lines = t.raw("inbox") as string[];
  const rows = lines.map((text, i) => ({ who: i % 2 === 0 ? "them" : "ai", text }));
  return (
    <ProductFrame title={t("inboxTitle")}>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => {
          const shown = reveal > (i + 0.4) / rows.length;
          return (
            <div
              key={r.text}
              className={`flex ${r.who === "ai" ? "justify-end" : "justify-start"}`}
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : "translateY(10px)",
                transition: "opacity .45s ease, transform .45s ease",
              }}
            >
              <div
                className="max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug"
                style={
                  r.who === "ai"
                    ? {
                        background: "rgba(47,163,154,.16)",
                        border: "1px solid rgba(47,163,154,.24)",
                        color: "var(--d-ink)",
                      }
                    : {
                        background: "var(--d-surface-glass)",
                        border: "1px solid var(--d-border)",
                        color: "var(--d-ink-soft)",
                      }
                }
              >
                {r.text}
              </div>
            </div>
          );
        })}

        <div
          className="mt-2 flex items-center gap-2.5 rounded-xl border border-[rgba(200,148,104,.34)] bg-[rgba(200,148,104,.08)] px-3.5 py-2.5"
          style={{
            opacity: reveal > 0.92 ? 1 : 0,
            transform: reveal > 0.92 ? "none" : "translateY(8px)",
            transition: "opacity .5s ease, transform .5s ease",
          }}
        >
          <span className="font-brand-mono text-[9.5px] uppercase tracking-[.14em] text-[var(--d-copper)]">
            {t("appointment")}
          </span>
          <span className="text-[12.5px] text-[var(--d-ink-soft)]">
            {t("appointmentValue")}
          </span>
        </div>
      </div>
    </ProductFrame>
  );
}

/** A contact whose history keeps growing — the CRM. */
export function CrmScene({ reveal = 1 }: { reveal?: number }) {
  const t = useTranslations("productFrame");
  const events = t.raw("crmEvents") as { when: string; what: string }[];
  return (
    <ProductFrame title={t("crmTitle")}>
      <div className="mb-3 flex items-center gap-3 border-b border-[var(--d-border)] pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--d-border)] bg-[var(--d-surface-glass)] text-[12px] text-[var(--d-ink-soft)]">
          DM
        </div>
        <div>
          <div className="text-[14px] font-semibold text-[var(--d-ink)]">Dana M.</div>
          <div className="font-brand-mono text-[10.5px] text-[var(--d-ink-faint)]">
            (321) ••• ••42
          </div>
        </div>
      </div>
      <ol className="relative flex flex-col gap-3 pl-4">
        <span
          aria-hidden="true"
          className="absolute left-[3px] top-1 w-px bg-[var(--d-border)]"
          style={{ height: `${Math.min(100, reveal * 100)}%`, transition: "height .3s linear" }}
        />
        {events.map((e, i) => {
          const shown = reveal > (i + 0.3) / events.length;
          return (
            <li
              key={e.when}
              className="relative"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : "translateX(-6px)",
                transition: "opacity .45s ease, transform .45s ease",
              }}
            >
              <span
                aria-hidden="true"
                className="absolute -left-4 top-[6px] h-[7px] w-[7px] rounded-full"
                style={{
                  background: i === events.length - 1 ? "var(--d-copper)" : "var(--d-teal)",
                }}
              />
              <div className="font-brand-mono text-[10px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
                {e.when}
              </div>
              <div className="text-[13px] text-[var(--d-ink-soft)]">{e.what}</div>
            </li>
          );
        })}
      </ol>
    </ProductFrame>
  );
}

/** What the week produced — Home. */
export function OutcomesScene({ reveal = 1 }: { reveal?: number }) {
  const t = useTranslations("productFrame");
  const stats = t.raw("stats") as { k: string; v: string }[];
  return (
    <ProductFrame title={t("homeTitle")}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--d-border)] bg-[var(--d-border)]">
        {stats.map((s, i) => {
          const shown = reveal > (i + 0.3) / stats.length;
          return (
            <div
              key={s.k}
              className="bg-[var(--d-bg-raised)] px-4 py-5"
              style={{
                opacity: shown ? 1 : 0,
                transform: shown ? "none" : "translateY(8px)",
                transition: "opacity .45s ease, transform .45s ease",
              }}
            >
              <div
                className="font-display text-[26px] font-semibold leading-none text-[var(--d-ink)]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {s.v}
              </div>
              <div className="mt-1.5 font-brand-mono text-[9.5px] uppercase tracking-[.12em] text-[var(--d-ink-faint)]">
                {s.k}
              </div>
            </div>
          );
        })}
      </div>
    </ProductFrame>
  );
}

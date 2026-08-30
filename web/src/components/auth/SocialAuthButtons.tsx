"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/**
 * Google / Facebook sign-in.
 *
 * Owner decision 2026-08-29: ship the UI now, wired to nothing, and switch it on
 * once the OAuth apps exist. That is why the buttons are genuinely `disabled`
 * rather than styled to look available — a button that opens nothing is worse
 * than one that plainly says "not yet".
 *
 * To enable: create the OAuth clients (Google Cloud, and Meta if Facebook is
 * kept), add them as providers in Supabase Auth, then set
 * `NEXT_PUBLIC_SOCIAL_AUTH_ENABLED=true` and implement `onProvider` to call
 * `supabase.auth.signInWithOAuth({ provider })`. Nothing else here changes.
 */

const ENABLED = process.env.NEXT_PUBLIC_SOCIAL_AUTH_ENABLED === "true";

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="currentColor"
        opacity=".75"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.94v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="currentColor"
        opacity=".55"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.94a9 9 0 0 0 0 8.1l3.03-2.33Z"
      />
      <path
        fill="currentColor"
        opacity=".85"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.03 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18 9a9 9 0 1 0-10.41 8.89v-6.29H5.31V9h2.28V7.02c0-2.25 1.34-3.5 3.4-3.5.98 0 2.01.18 2.01.18v2.21h-1.13c-1.12 0-1.47.7-1.47 1.41V9h2.5l-.4 2.6h-2.1v6.29A9 9 0 0 0 18 9Z"
      />
    </svg>
  );
}

export function SocialAuthButtons({
  surface = "dark",
  onProvider,
}: {
  surface?: "dark" | "warm";
  onProvider?: (provider: "google" | "facebook") => void;
}) {
  const t = useTranslations("auth");
  const dark = surface === "dark";
  const base = dark
    ? "border-[var(--d-border)] text-[var(--d-ink)] hover:border-[rgba(200,148,104,.45)] hover:bg-[var(--d-surface-glass)]"
    : "border-[#0A1A2F]/12 text-[#0A1A2F] hover:border-[#1B6E6E] hover:bg-[#FBFAF8]";

  const providers = [
    { id: "google" as const, label: "Google", glyph: <GoogleGlyph /> },
    { id: "facebook" as const, label: "Facebook", glyph: <FacebookGlyph /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className="h-px flex-1"
          style={{ background: dark ? "var(--d-border)" : "rgba(10,26,47,.10)" }}
        />
        <span
          className="font-brand-mono text-[10px] uppercase tracking-[.16em]"
          style={{ color: dark ? "var(--d-ink-faint)" : "#6B7888" }}
        >
          {t("or")}
        </span>
        <span
          className="h-px flex-1"
          style={{ background: dark ? "var(--d-border)" : "rgba(10,26,47,.10)" }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!ENABLED}
            onClick={ENABLED ? () => onProvider?.(p.id) : undefined}
            title={ENABLED ? undefined : t("socialTooltip")}
            className={`inline-flex items-center justify-center gap-2.5 rounded-[12px] border px-4 py-3 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${base}`}
          >
            {p.glyph}
            {p.label}
          </button>
        ))}
      </div>

      {!ENABLED && (
        <p
          className="text-center text-[12px]"
          style={{ color: dark ? "var(--d-ink-faint)" : "#6B7888" }}
        >
          {t("socialSoon")}
        </p>
      )}
    </div>
  );
}

export default SocialAuthButtons;

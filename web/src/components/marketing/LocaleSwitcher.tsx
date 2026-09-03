"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, LOCALE_LABELS, LOCALE_CHOICE_COOKIE, type Locale } from "@/i18n/routing";

/**
 * Language switcher.
 *
 * Switching navigates through next-intl's router, which sets `NEXT_LOCALE`. This
 * component ALSO writes `DENKU_LOCALE`, and that second cookie is the one the
 * middleware's country-based pick respects.
 *
 * Two cookies for one idea, because `NEXT_LOCALE` cannot answer the question the
 * middleware is asking. next-intl writes it on ANY locale-resolving navigation,
 * including a first visit that simply landed on `/en` — the canonical English URL,
 * the one in the sitemap, the one Google sends people to. So a visitor in Turkey
 * arriving from an English search result was recorded as having "chosen" English
 * and never saw Turkish again, even typing denku.io directly. (Observed 2026-09-03.)
 *
 * `DENKU_LOCALE` is written in exactly one place: here, when a person clicks a
 * language. That is the only event that means "I chose this".
 *
 * `usePathname` here comes from the i18n navigation helpers, so it returns the
 * path *without* the locale prefix — the same route can then be re-resolved in the
 * target language rather than string-manipulated.
 */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (next: Locale) => {
    setOpen(false);
    // Record the CHOICE, which is a different fact from "a page in this language was
    // rendered" — see the note above. A year, so it outlives the session; SameSite=Lax
    // because it is only ever read on a top-level navigation.
    document.cookie = `${LOCALE_CHOICE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // `params` carries dynamic segments (e.g. the employee slug) so the same page
    // is re-resolved in the new language instead of dropping to the index.
    router.replace(
      // @ts-expect-error — pathname is a known route; params supplies its segments.
      { pathname, params },
      { locale: next }
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("changeLanguage")}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-brand-mono text-[11px] uppercase tracking-[.14em] text-[var(--s-ink-soft)] transition-colors hover:text-[var(--s-accent)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
          <path
            d="M1.6 8h12.8M8 1.6c1.7 1.9 2.6 4 2.6 6.4S9.7 12.5 8 14.4c-1.7-1.9-2.6-4-2.6-6.4S6.3 3.5 8 1.6Z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        {compact ? locale.toUpperCase() : LOCALE_LABELS[locale]}
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[150px] overflow-hidden rounded-xl border border-[var(--s-border)] bg-[var(--s-bg-overlay)] py-1 shadow-xl"
        >
          {routing.locales.map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={l === locale}
                onClick={() => pick(l)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-[var(--s-hover-bg)]"
                style={{
                  color: l === locale ? "var(--s-accent)" : "var(--s-ink-soft)",
                }}
              >
                {LOCALE_LABELS[l]}
                {l === locale && <span aria-hidden="true">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocaleSwitcher;

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { setDashboardLocale } from "@/app/(app)/dashboard/_actions/locale";
import { useDashboardLocale } from "./DashboardLocaleProvider";

export default function DashboardLanguageSwitcher() {
  const { locale, translate } = useDashboardLocale();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // One-time compatibility sync for accounts created before `profiles.ui_locale` existed. Their
  // current cookie already drives the UI; this makes future service/Auth emails follow it too.
  useEffect(() => {
    const key = `denku:locale-synced:${locale}`;
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    void setDashboardLocale(locale).then((result) => {
      if (!result.ok) sessionStorage.removeItem(key);
    });
  }, [locale]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function selectLocale(nextLocale: Locale) {
    if (nextLocale === locale) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      const result = await setDashboardLocale(nextLocale);
      if (!result.ok) return;
      // Reload from the English source markup. This also refreshes Server Components and avoids a
      // mixed-language frame when switching directly from one translated locale to another.
      window.location.reload();
    });
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0" data-dashboard-no-translate="true">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={translate("Interface language")}
        title={translate("Interface language")}
        disabled={isPending}
        className="flex h-10 items-center gap-1.5 rounded-full px-2.5 text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white/70 dark:hover:bg-white/10"
      >
        <Languages className="h-5 w-5" aria-hidden="true" />
        <span className="hidden text-xs font-semibold uppercase sm:inline">{locale}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={translate("Interface language")}
          className="absolute right-0 top-12 z-[9999] w-44 overflow-hidden rounded-2xl bg-white py-2 shadow-xl shadow-shadow-500 dark:bg-navy-700 dark:shadow-none"
        >
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {translate("Interface language")}
          </p>
          {routing.locales.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={option === locale}
              onClick={() => selectLocale(option)}
              disabled={isPending}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-navy-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:text-white dark:hover:bg-white/5"
            >
              <span>{LOCALE_LABELS[option]}</span>
              {option === locale ? <Check className="h-4 w-4 text-brand-500" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

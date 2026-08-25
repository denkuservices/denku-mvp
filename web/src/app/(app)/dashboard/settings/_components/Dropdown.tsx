"use client";

import * as React from "react";

export type DropdownOption = { value: string; label: string; description?: string };

export function Dropdown({
  label,
  helper,
  value,
  onChange,
  options,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.value === value) ?? options[0];

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div className="space-y-2" ref={ref}>
      <p className="text-sm font-semibold tracking-tight text-navy-700 dark:text-white">{label}</p>

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-3 text-left text-base shadow-sm outline-none transition hover:bg-gray-50 dark:hover:bg-white/5 focus:ring-4 focus:ring-brand-500/15"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-700 dark:text-white">{selected.label}</p>
              {selected.description ? (
                <p className="truncate text-xs text-gray-500">{selected.description}</p>
              ) : null}
            </div>

            <svg
              className={`h-5 w-5 flex-none text-gray-500 transition ${open ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </button>

        {open ? (
          <div
            role="listbox"
            className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 shadow-lg"
          >
            <div className="max-h-72 overflow-auto">
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left transition ${
                      active ? "bg-brand-500 text-white" : "hover:bg-gray-50 dark:hover:bg-white/5 text-navy-700 dark:text-white"
                    }`}
                  >
                    <p className={`text-base font-medium ${active ? "text-white" : "text-navy-700 dark:text-white"}`}>
                      {o.label}
                    </p>
                    {o.description ? (
                      <p className={`text-xs ${active ? "text-gray-200" : "text-gray-500"}`}>
                        {o.description}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

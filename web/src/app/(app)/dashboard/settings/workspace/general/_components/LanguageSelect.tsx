"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_OPTIONS } from "@/app/(app)/dashboard/settings/_lib/options";
import { FieldLabel } from "@/app/(app)/dashboard/_platform/settings/ui";

type LanguageSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
};

/**
 * Language picker. Carries its own glyph and matches the height/radius/focus ring of the plain
 * inputs beside it — a select that is 12px taller than the field next to it is the kind of drift
 * that makes a form look assembled rather than designed.
 */
export function LanguageSelect({
  label,
  value,
  onChange,
  helper,
  readOnly,
}: LanguageSelectProps) {
  if (readOnly) {
    const selected = LANGUAGE_OPTIONS.find((opt) => opt.value === value);
    return (
      <div className="space-y-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
          <Languages aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="text-navy-700 dark:text-white">{selected?.label || value || "—"}</span>
        </div>
        {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
      </div>
    );
  }

  // Convert empty string to undefined for Select (Select doesn't accept empty string values)
  const selectValue = value && value.trim() !== "" ? value : undefined;

  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Languages
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
        <Select value={selectValue} onValueChange={onChange}>
          {/* Same reason as the timezone combobox: a Radix trigger takes its name from aria-label. */}
          <SelectTrigger aria-label={label} className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm transition hover:bg-gray-50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-navy-900 dark:hover:bg-white/5">
            <SelectValue placeholder="Select a language" />
          </SelectTrigger>
          <SelectContent className="max-h-[260px]">
            {LANGUAGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value} className="py-2 text-sm">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

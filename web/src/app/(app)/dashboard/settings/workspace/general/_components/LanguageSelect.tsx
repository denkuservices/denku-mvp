"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LANGUAGE_OPTIONS } from "@/app/(app)/dashboard/settings/_lib/options";

type LanguageSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
};

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
        <p className="text-sm font-semibold text-navy-700 dark:text-white">{label}</p>
        <div className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-3 text-base">
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
      <p className="text-sm font-semibold text-navy-700 dark:text-white">{label}</p>
      <Select value={selectValue} onValueChange={onChange}>
        <SelectTrigger className="w-full h-12 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-3 text-base shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 focus:ring-4 focus:ring-brand-500/15">
          <SelectValue placeholder="Select a language" />
        </SelectTrigger>
        <SelectContent className="max-h-[260px]">
          {LANGUAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-base py-2">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}


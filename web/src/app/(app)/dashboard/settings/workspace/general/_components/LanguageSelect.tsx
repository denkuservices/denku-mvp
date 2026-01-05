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
        <p className="text-sm font-semibold text-zinc-900">{label}</p>
        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base">
          <span className="text-zinc-900">{selected?.label || value || "—"}</span>
        </div>
        {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
      </div>
    );
  }

  // Convert empty string to undefined for Select (Select doesn't accept empty string values)
  const selectValue = value && value.trim() !== "" ? value : undefined;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <Select value={selectValue} onValueChange={onChange}>
        <SelectTrigger className="w-full h-12 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm hover:bg-zinc-50 focus:ring-4 focus:ring-zinc-100">
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
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}


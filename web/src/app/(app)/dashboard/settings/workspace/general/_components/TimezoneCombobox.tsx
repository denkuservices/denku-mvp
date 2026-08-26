"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon, Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { FieldLabel } from "@/app/(app)/dashboard/_platform/settings/ui";

type TimezoneComboboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
  timezoneOptions: string[];
};

/** Timezone picker — same glyph-in-control treatment and metrics as every other field. */
export function TimezoneCombobox({
  label,
  value,
  onChange,
  helper,
  readOnly,
  timezoneOptions,
}: TimezoneComboboxProps) {
  const [open, setOpen] = React.useState(false);

  if (readOnly) {
    return (
      <div className="space-y-2">
        <FieldLabel>{label}</FieldLabel>
        <div className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/5">
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="text-navy-700 dark:text-white">{value || "—"}</span>
        </div>
        {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-normal shadow-sm transition hover:bg-gray-50 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 dark:border-white/10 dark:bg-navy-900 dark:hover:bg-white/5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate text-left">{value || "Type or select a timezone"}</span>
            </span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search timezone..." className="h-11" />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>No timezone found.</CommandEmpty>
              <CommandGroup>
                {timezoneOptions.map((tz) => {
                  const isSelected = tz === value;
                  return (
                    <CommandItem
                      key={tz}
                      value={tz}
                      onSelect={() => {
                        onChange(tz);
                        setOpen(false);
                      }}
                      className="py-2 text-sm"
                    >
                      <CheckIcon
                        className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      {tz}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

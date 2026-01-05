"use client";

import * as React from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
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

type TimezoneComboboxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
  timezoneOptions: string[];
};

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
        <p className="text-sm font-semibold text-zinc-900">{label}</p>
        <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base">
          <span className="text-zinc-900">{value || "—"}</span>
        </div>
        {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base font-normal shadow-sm hover:bg-zinc-50 focus:ring-4 focus:ring-zinc-100 data-[variant=outline]:bg-white"
          >
            <span className="truncate text-left">{value || "Type or select a timezone"}</span>
            <ChevronsUpDownIcon className="ml-2 h-5 w-5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search timezone..." className="h-12" />
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
                      className="text-base py-2"
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
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
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}

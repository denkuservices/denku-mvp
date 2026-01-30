"use client";

import { useState, useEffect } from "react";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TestCallButton } from "../TestCallButton";
import { PauseResumeButton } from "../PauseResumeButton";

export type LineType = "support" | "after_hours" | "sales";

export interface PhoneLineSummaryBarProps {
  line: {
    id: string;
    phone_number_e164: string | null;
    status: string | null;
    line_type: string | null;
    display_name: string | null;
  };
  todayInboundCalls: number;
  lastCallFormatted: string;
  capacityLabel: string;
  isPreviewMode?: boolean;
  onCopyPhoneNumber: () => void;
  onSaveDisplayName: (newName: string) => Promise<void>;
  onDeleteClick: () => void;
  saveToast: string | null;
}

function formatPhoneNumber(e164: string | null): string {
  if (!e164) return "Not assigned";
  const cleaned = e164.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const area = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const number = cleaned.slice(7);
    return `+1 (${area}) ${exchange}-${number}`;
  }
  return e164;
}

function lineTypeLabel(lineType: string | null): string {
  if (!lineType) return "Support";
  if (lineType === "after_hours") return "After-hours";
  if (lineType === "sales") return "Sales";
  return "Support";
}

export function PhoneLineSummaryBar({
  line,
  todayInboundCalls,
  lastCallFormatted,
  capacityLabel,
  isPreviewMode = false,
  onCopyPhoneNumber,
  onSaveDisplayName,
  onDeleteClick,
  saveToast,
}: PhoneLineSummaryBarProps) {
  const [displayName, setDisplayName] = useState(line.display_name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  useEffect(() => {
    setDisplayName(line.display_name || "");
  }, [line.display_name]);

  const status = (line.status || "live").toLowerCase();
  const isLive = status === "live" || status === "active";
  const isError = status === "error";

  const handleBlurOrSubmit = () => {
    setIsEditingName(false);
    const trimmed = displayName.trim();
    if (trimmed === (line.display_name || "")) return;
    setIsSaving(true);
    onSaveDisplayName(trimmed || "").finally(() => setIsSaving(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBlurOrSubmit();
    if (e.key === "Escape") {
      setIsEditingName(false);
      setDisplayName(line.display_name || "");
    }
  };

  return (
    <div
      className="sticky top-4 z-20 mb-8 rounded-2xl border border-gray-200/80 bg-white/80 px-6 py-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-navy-800/80 md:px-8"
      style={{ minHeight: "1px" }}
    >
      {/* Row 1: Primary — left (number, name, type) | right (status, actions) */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        {/* Left */}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-navy-800 dark:text-white sm:text-2xl">
              {formatPhoneNumber(line.phone_number_e164)}
            </span>
            {line.phone_number_e164 && (
              <button
                type="button"
                onClick={onCopyPhoneNumber}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-navy-600 dark:hover:bg-white/10 dark:hover:text-white"
                title="Copy phone number"
                aria-label="Copy phone number"
              >
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditingName ? (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                onBlur={handleBlurOrSubmit}
                onKeyDown={handleKeyDown}
                autoFocus
                maxLength={60}
                className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-navy-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-1.5 text-left text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
              >
                <span>{displayName || "Unnamed line"}</span>
                {isSaving ? (
                  <span className="text-xs text-gray-400">Saving…</span>
                ) : (
                  <Pencil className="h-3.5 w-3.5 shrink-0 opacity-60" />
                )}
              </button>
            )}
          </div>
          <div>
            <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
              {lineTypeLabel(line.line_type)}
            </span>
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:justify-end">
          <span
            className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              isLive
                ? "bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : isError
                  ? "bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300"
            }`}
          >
            {isLive ? "Live" : isError ? "Error" : "Paused"}
          </span>
          <PauseResumeButton
            lineId={line.id}
            currentStatus={line.status}
            isPreviewMode={isPreviewMode}
          />
          <TestCallButton isPreviewMode={isPreviewMode} />
          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-navy-700 dark:border-white/10 dark:bg-navy-700 dark:hover:bg-white/10 dark:hover:text-white"
                aria-label="More actions"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={8} className="w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-navy-800">
              <button
                type="button"
                onClick={() => {
                  if (!isPreviewMode) {
                    setActionsOpen(false);
                    onDeleteClick();
                  }
                }}
                disabled={isPreviewMode}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete line
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Row 2: Metrics */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200/80 pt-5 dark:border-white/10">
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Today calls
            </div>
            <div className="mt-0.5 text-sm font-semibold text-navy-700 dark:text-white">
              {todayInboundCalls}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Last call
            </div>
            <div className="mt-0.5 text-sm font-semibold text-navy-700 dark:text-white">
              {lastCallFormatted}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Capacity
            </div>
            <div className="mt-0.5 text-sm font-semibold text-navy-700 dark:text-white">
              {capacityLabel}
            </div>
          </div>
        </div>
        <a
          href={`/dashboard/calls?phoneLineId=${line.id}`}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          View calls →
        </a>
      </div>

      {saveToast && (
        <div className="sr-only" role="status" aria-live="polite">
          {saveToast}
        </div>
      )}
    </div>
  );
}

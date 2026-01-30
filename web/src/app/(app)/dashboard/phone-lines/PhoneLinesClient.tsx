"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BsThreeDotsVertical } from "react-icons/bs";
import { Power, Copy, PhoneCall, Trash2, Lock, Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PhoneLineRow } from "@/lib/phone-lines/queries";
import { DeletePhoneLineDialog } from "./_components/DeletePhoneLineDialog";
import { AddPhoneNumberButton } from "./_components/AddPhoneNumberButton";

interface PhoneLinesClientProps {
  phoneLines: PhoneLineRow[];
  isPreviewMode?: boolean;
}

/**
 * Format phone number for display.
 */
function formatPhoneNumber(e164: string | null): string {
  if (!e164) return "Not assigned";
  // Simple formatting: +1 (321) 555-1234
  const cleaned = e164.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const area = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const number = cleaned.slice(7);
    return `+1 (${area}) ${exchange}-${number}`;
  }
  return e164;
}

/**
 * Format status badge.
 */
function StatusBadge({ status }: { status: string | null }) {
  const statusLower = (status || "live").toLowerCase();
  const isLive = statusLower === "live" || statusLower === "active";
  const isError = statusLower === "error";
  
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isLive
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
          : isError
          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
      }`}
    >
      {isLive ? "Live" : statusLower === "paused" ? "Paused" : statusLower === "error" ? "Error" : status || "Unknown"}
    </span>
  );
}

/**
 * Format line type badge with lock icon for locked types.
 */
function LineTypeBadge({ lineType }: { lineType: string | null }) {
  const type = lineType || "support";
  const isLocked = type === "sales" || type === "after_hours";
  
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
      {isLocked && <Lock className="h-3 w-3" />}
      {type === "support" ? "Support" : type === "after_hours" ? "After-hours" : type === "sales" ? "Sales" : type}
    </span>
  );
}

function PhoneLineActionsMenu({
  lineId,
  status,
  onPause,
  onResume,
  onDelete,
  isPreviewMode = false,
}: {
  lineId: string;
  status: string | null;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  isPreviewMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const isLive = (status || "live").toLowerCase() === "live" || (status || "live").toLowerCase() === "active";

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Open actions menu"
            className="flex items-center justify-center rounded-lg bg-lightPrimary p-2 text-brand-500 hover:bg-gray-100 dark:bg-navy-700 dark:text-white dark:hover:bg-white/20 transition duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <BsThreeDotsVertical className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-max p-0 rounded-xl bg-white shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none z-50"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            // Prevent row navigation on Escape
            if (e.key === "Escape") {
              e.stopPropagation();
            }
          }}
        >
          <div className="px-4 py-3 space-y-0.5" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                handleAction(() => router.push(`/dashboard/phone-lines/${lineId}`));
              }}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-navy-700 transition-colors hover:bg-gray-50 hover:font-medium dark:text-white dark:hover:bg-white/5 text-left focus:outline-none focus:bg-gray-50 dark:focus:bg-white/5"
            >
              View line details
            </button>
            <div className="group relative">
              <button
                type="button"
                role="menuitem"
                disabled={isPreviewMode}
                title={isPreviewMode ? "Upgrade to activate this feature" : "Coming soon"}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className={`mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left focus:outline-none ${
                  isPreviewMode
                    ? "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
                    : "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
                }`}
                aria-disabled="true"
              >
                <PhoneCall className="h-4 w-4" />
                Test call
              </button>
              {/* Tooltip on hover */}
              <div className="absolute left-0 top-full z-10 mt-2 hidden w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block dark:border-white/20 dark:bg-navy-800">
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {isPreviewMode ? "Upgrade to activate this feature" : "Coming soon"}
                </p>
              </div>
            </div>
            {isLive ? (
              <div className="group relative">
                <button
                  type="button"
                  role="menuitem"
                  disabled={isPreviewMode}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPreviewMode) {
                      handleAction(onPause);
                    }
                  }}
                  className={`mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors focus:outline-none ${
                    isPreviewMode
                      ? "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
                      : "cursor-pointer text-navy-700 hover:bg-gray-50 hover:font-medium dark:text-white dark:hover:bg-white/5 focus:bg-gray-50 dark:focus:bg-white/5"
                  }`}
                  aria-disabled={isPreviewMode}
                >
                  <Power className="h-4 w-4" />
                  Pause line
                </button>
                {isPreviewMode && (
                  <div className="absolute left-0 top-full z-10 mt-2 hidden w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block dark:border-white/20 dark:bg-navy-800">
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      Upgrade to activate this feature
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="group relative">
                <button
                  type="button"
                  role="menuitem"
                  disabled={isPreviewMode}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPreviewMode) {
                      handleAction(onResume);
                    }
                  }}
                  className={`mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors focus:outline-none ${
                    isPreviewMode
                      ? "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
                      : "cursor-pointer text-navy-700 hover:bg-gray-50 hover:font-medium dark:text-white dark:hover:bg-white/5 focus:bg-gray-50 dark:focus:bg-white/5"
                  }`}
                  aria-disabled={isPreviewMode}
                >
                  <Power className="h-4 w-4" />
                  Resume line
                </button>
                {isPreviewMode && (
                  <div className="absolute left-0 top-full z-10 mt-2 hidden w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block dark:border-white/20 dark:bg-navy-800">
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      Upgrade to activate this feature
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="group relative">
              <button
                type="button"
                role="menuitem"
                disabled={isPreviewMode}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isPreviewMode) {
                    handleAction(onDelete);
                  }
                }}
                className={`mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors focus:outline-none ${
                  isPreviewMode
                    ? "cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500"
                    : "cursor-pointer text-red-600 hover:bg-red-50 hover:font-medium dark:text-red-400 dark:hover:bg-red-950/20 focus:bg-red-50 dark:focus:bg-red-950/20"
                }`}
                aria-disabled={isPreviewMode}
              >
                <Trash2 className="h-4 w-4" />
                Delete line
              </button>
              {isPreviewMode && (
                <div className="absolute left-0 top-full z-10 mt-2 hidden w-48 rounded-lg border border-gray-200 bg-white p-2 shadow-lg group-hover:block dark:border-white/20 dark:bg-navy-800">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    Upgrade to activate this feature
                  </p>
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function PhoneLinesClient({ phoneLines: initialPhoneLines, isPreviewMode = false }: PhoneLinesClientProps) {
  const router = useRouter();
  const [phoneLines, setPhoneLines] = useState(initialPhoneLines);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null);

  const handlePause = async (lineId: string) => {
    // Prevent API call in preview mode
    if (isPreviewMode) {
      return;
    }
    try {
      const res = await fetch(`/api/phone-lines/${lineId}/pause`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setToastMessage(data.error || "Failed to pause line");
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }

      // Optimistically update status
      setPhoneLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, status: "paused" } : line
        )
      );

      setToastMessage("Line paused");
      setTimeout(() => setToastMessage(null), 2000);
      router.refresh();
    } catch (err) {
      setToastMessage("Failed to pause line");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleResume = async (lineId: string) => {
    try {
      const res = await fetch(`/api/phone-lines/${lineId}/resume`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setToastMessage(data.error || "Failed to resume line");
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }

      // Optimistically update status
      setPhoneLines((prev) =>
        prev.map((line) =>
          line.id === lineId ? { ...line, status: "live" } : line
        )
      );

      setToastMessage("Line resumed");
      setTimeout(() => setToastMessage(null), 2000);
      router.refresh();
    } catch (err) {
      setToastMessage("Failed to resume line");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  const handleDeleteClick = (lineId: string) => {
    // Prevent delete dialog from opening in preview mode
    if (isPreviewMode) {
      return;
    }
    setDeleteLineId(lineId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteOpenChange = (open: boolean) => {
    setDeleteDialogOpen(open);
    if (!open) setDeleteLineId(null);
  };

  const handleCopyPhoneNumber = (e: React.MouseEvent, phoneNumber: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phoneNumber);
    setToastMessage("Phone number copied to clipboard");
    setTimeout(() => setToastMessage(null), 2000);
  };

  if (phoneLines.length === 0) {
    // Preview mode: no plan active
    if (isPreviewMode) {
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-white/10 dark:bg-navy-800">
          <div className="mx-auto max-w-md">
            <h2 className="mb-2 text-xl font-semibold text-navy-700 dark:text-white">
              Choose a plan to activate phone lines
            </h2>
            <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
              Preview mode is read-only. Upgrade to add phone numbers and take live calls.
            </p>
            <Link
              href="/dashboard/settings/workspace/billing"
              className="linear inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
            >
              Choose a plan
            </Link>
          </div>
        </div>
      );
    }

    // Paid state: no lines yet
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-white/10 dark:bg-navy-800">
        <div className="mx-auto max-w-md">
          <h2 className="mb-2 text-xl font-semibold text-navy-700 dark:text-white">
            No phone lines yet
          </h2>
          <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
            Add a phone number to start receiving calls.
          </p>
          <div className="flex flex-col items-center gap-3">
            <AddPhoneNumberButton isPreviewMode={false} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-brand-500 text-white px-4 py-2 text-sm shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteLineId && (
        <DeletePhoneLineDialog
          lineId={deleteLineId}
          open={deleteDialogOpen}
          onOpenChange={handleDeleteOpenChange}
          onConfirm={async () => {
            const res = await fetch(`/api/phone-lines/${deleteLineId}`, { method: "DELETE" });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || "Failed to delete phone line");
            }
            router.refresh();
          }}
          onDeleted={() => {
            setPhoneLines((prev) => prev.filter((line) => line.id !== deleteLineId));
            setToastMessage("Line deleted");
            setTimeout(() => setToastMessage(null), 2000);
          }}
        />
      )}

      {/* Mobile card list (visible on < md) */}
      <div className="md:hidden space-y-3">
        {phoneLines.map((line) => (
          <div
            key={line.id}
            onClick={() => router.push(`/dashboard/phone-lines/${line.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(`/dashboard/phone-lines/${line.id}`);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`View details for ${line.display_name || "phone line"}`}
            className="relative rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:hover:bg-navy-700/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset cursor-pointer"
          >
            {/* Top row: Phone number + Status */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-navy-700 dark:text-white">
                {formatPhoneNumber(line.phone_number_e164)}
              </span>
              <StatusBadge status={line.status} />
            </div>

            {/* Second row: Line name + Type badge */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-navy-700 dark:text-white">
                {line.display_name || "Support Line"}
              </span>
              <LineTypeBadge lineType={line.line_type} />
            </div>

            {/* Bottom row: Today metric | 3-dot menu */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">Today</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {line.todayInboundCalls ?? 0}
                </span>
              </div>

            {/* Right side: Overflow menu */}
            <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
              <PhoneLineActionsMenu
                lineId={line.id}
                status={line.status}
                onPause={() => handlePause(line.id)}
                onResume={() => handleResume(line.id)}
                onDelete={() => handleDeleteClick(line.id)}
                isPreviewMode={isPreviewMode}
              />
            </div>
          </div>
          </div>
        ))}
      </div>

      {/* Desktop table (visible on md+) */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Line Name / Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Today
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                AI
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {phoneLines.map((line) => (
              <tr
                key={line.id}
                onClick={() => router.push(`/dashboard/phone-lines/${line.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/dashboard/phone-lines/${line.id}`);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View details for ${line.display_name || "phone line"}`}
                className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-navy-700/50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-inset"
              >
                {/* Number column */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-navy-700 hover:text-brand-500 dark:text-white dark:hover:text-brand-400">
                      {formatPhoneNumber(line.phone_number_e164)}
                    </span>
                    {line.phone_number_e164 && (
                      <button
                        type="button"
                        onClick={(e) => handleCopyPhoneNumber(e, line.phone_number_e164!)}
                        className="text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 rounded"
                        title="Copy phone number"
                        aria-label="Copy phone number"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                {/* Line Name / Type column */}
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-navy-700 dark:text-white">
                      {line.display_name || "Support Line"}
                    </span>
                    <LineTypeBadge lineType={line.line_type} />
                  </div>
                </td>
                {/* Status column */}
                <td className="px-4 py-3">
                  <StatusBadge status={line.status} />
                </td>
                {/* Today column */}
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {line.todayInboundCalls ?? 0}
                  </div>
                </td>
                {/* AI column */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Default
                    </span>
                    <Link
                      href={`/dashboard/phone-lines/${line.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 flex items-center gap-1"
                    >
                      <Settings className="h-3 w-3" />
                      Advanced
                    </Link>
                  </div>
                </td>
                {/* Actions column */}
                <td className="px-4 py-3">
                  <PhoneLineActionsMenu
                    lineId={line.id}
                    status={line.status}
                    onPause={() => handlePause(line.id)}
                    onResume={() => handleResume(line.id)}
                    onDelete={() => handleDeleteClick(line.id)}
                    isPreviewMode={isPreviewMode}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

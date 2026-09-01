"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface AssignableEmployee {
  id: string;
  name: string;
  /** What it already answers on, so the reader can tell two employees apart at a glance. */
  channelSummary: string | null;
}

interface AssignedAITabProps {
  line: {
    id: string;
    first_message: string | null;
    assigned_agent_id?: string | null;
  };
  /** Every AI employee in this workspace. Empty is a real state — a new workspace has none. */
  employees: AssignableEmployee[];
  onUpdate: (updates: Partial<AssignedAITabProps["line"]>) => void;
  onSaveError?: () => void;
}

/**
 * WHO answers this line, and what they say first.
 *
 * The tab was named "Assigned AI" and could not assign an AI. It edited one field — the greeting
 * — while the actual assignment lived only in a database column that nothing in the product ever
 * wrote from a screen. So a customer following the dashboard's own "Assign an employee" button
 * arrived here, found a greeting box, and had no way to do the thing the button promised.
 *
 * The picker is the tab's first control now, because it is the one that decides whether calls to
 * this number are answered at all. The greeting is secondary and stays where it was
 * (`phone_lines.first_message`), saved by its own button.
 *
 * Sprint 9 · T6 removed three controls from here that had no columns to save to. That rule still
 * holds: everything on this tab persists.
 */
export function AssignedAITab({ line, employees, onUpdate, onSaveError }: AssignedAITabProps) {
  const [firstMessage, setFirstMessage] = useState(line.first_message || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const assignedId = line.assigned_agent_id ?? null;
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const savedFirstMessage = line.first_message || "";
  const isDirty = firstMessage !== savedFirstMessage;

  useEffect(() => {
    setFirstMessage(savedFirstMessage);
  }, [savedFirstMessage]);

  const assigned = employees.find((e) => e.id === assignedId) ?? null;

  const handleAssign = useCallback(
    async (employeeId: string | null) => {
      if (assigning) return;
      setAssignError(null);
      setAssigning(employeeId ?? "__none__");
      try {
        const res = await fetch("/api/channels/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "voice", connectionId: line.id, employeeId }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          onUpdate({ assigned_agent_id: employeeId });
        } else {
          setAssignError(data?.error || "Couldn't save that. Please try again.");
          onSaveError?.();
        }
      } catch {
        setAssignError("Couldn't save that. Please try again.");
        onSaveError?.();
      } finally {
        setAssigning(null);
      }
    },
    [assigning, line.id, onUpdate, onSaveError]
  );

  const handleSaveClick = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/phone-lines/${line.id}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_message: firstMessage || null }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUpdate({ first_message: firstMessage || null });
      } else {
        setSaveError(data?.error || "Failed to save. Please try again.");
        onSaveError?.();
      }
    } catch {
      setSaveError("Failed to save. Please try again.");
      onSaveError?.();
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isSaving, firstMessage, line.id, onUpdate, onSaveError]);

  return (
    <div className="space-y-8">
      {/* ── Who answers ─────────────────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Who answers this line</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          The AI employee that picks up. Its personality, language and business knowledge come with
          it, so the same employee sounds the same on every channel it works.
        </p>

        {assignError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {assignError}
          </div>
        )}

        {employees.length === 0 ? (
          // No invented affordance: there is genuinely nobody to pick.
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
            <p>This workspace has no AI employees yet, so there is nobody to put on this line.</p>
            <Link
              href="/dashboard/team/new"
              className="mt-3 inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              <UserPlus className="h-4 w-4" />
              Hire an AI employee
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {employees.map((employee) => {
              const isAssigned = employee.id === assignedId;
              const busy = assigning === employee.id;
              return (
                <li key={employee.id}>
                  <div
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      isAssigned
                        ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10"
                        : "border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isAssigned
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300"
                      }`}
                    >
                      <Bot className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {employee.name}
                      </p>
                      {employee.channelSummary && (
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {employee.channelSummary}
                        </p>
                      )}
                    </div>
                    {isAssigned ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300">
                        <Check className="h-4 w-4" />
                        Answering
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => void handleAssign(employee.id)}
                        disabled={Boolean(assigning)}
                        className="shrink-0"
                      >
                        {busy ? "Assigning…" : "Assign"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {assigned ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={`/dashboard/team/${assigned.id}?tab=setup`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
            >
              Configure {assigned.name}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            {/*
              Unassigning is a real decision — taking a number out of service without giving it
              up — so it is offered plainly, and never as the accidental result of clicking the
              row that is already selected.
            */}
            <button
              type="button"
              onClick={() => void handleAssign(null)}
              disabled={Boolean(assigning)}
              className="text-sm text-gray-500 underline underline-offset-4 transition hover:text-gray-700 disabled:opacity-60 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {assigning === "__none__" ? "Removing…" : "Leave this line unanswered"}
            </button>
          </div>
        ) : employees.length > 0 ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            Nobody is on this line yet — callers will not be answered until you assign someone.
          </p>
        ) : null}
      </section>

      {/* ── What they say first ─────────────────────────────────────────────────────── */}
      <section className="border-t border-gray-200 pt-6 dark:border-white/10">
        {saveError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {saveError}
          </div>
        )}

        <label
          htmlFor="first-message"
          className="mb-2 block text-sm font-medium text-gray-700 dark:text-white"
        >
          First message
        </label>
        <textarea
          id="first-message"
          value={firstMessage}
          onChange={(e) => setFirstMessage(e.target.value)}
          disabled={isSaving}
          rows={3}
          placeholder="Hi, thanks for calling. How can I help you today?"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          What callers hear when the call starts. This one is specific to this number — leave it
          blank to use the employee&apos;s own opening line.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {isDirty && <p className="text-xs text-gray-500 dark:text-gray-400">Unsaved changes</p>}
          {isSaving && (
            <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
              Saving…
            </p>
          )}
          <Button
            variant="primary"
            onClick={handleSaveClick}
            disabled={!isDirty || isSaving}
            className="w-fit"
          >
            Save changes
          </Button>
        </div>
      </section>
    </div>
  );
}

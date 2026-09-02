"use client";

import Link from "next/link";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface LineConfigurationTabProps {
  line: {
    id: string;
    tools_create_ticket: boolean | null;
    tools_book_appointment: boolean | null;
  };
  onUpdate: (updates: Partial<LineConfigurationTabProps["line"]>) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveError?: () => void;
}

/**
 * What belongs to a LINE, and what belongs to the EMPLOYEE answering it.
 *
 * This tab used to carry a "Language routing" select (Auto-detect / English / Turkish). It was a
 * second door onto the employee's own `language`, and the two could disagree with nothing to
 * reconcile them. It was also a hand-written list: the language registry has Spanish and German
 * too, so a workspace could configure an employee this screen was unable to show.
 *
 * The deeper reason it is gone: language is a property of the employee, and one employee answers
 * on several channels. Offering it per line promises a per-line setting the data model does not
 * keep. What stays here is what is genuinely the line's own — its tools, and (elsewhere on the
 * page) its assignment and pause state.
 */
export function LineConfigurationTab({ line, onUpdate, onDirtyChange, onSaveError }: LineConfigurationTabProps) {
  const [toolsCreateTicket, setToolsCreateTicket] = useState(line.tools_create_ticket ?? true);
  const [toolsBookAppointment, setToolsBookAppointment] = useState(line.tools_book_appointment ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedToolsCreateTicket = line.tools_create_ticket ?? true;
  const savedToolsBookAppointment = line.tools_book_appointment ?? true;

  const isDirty =
    toolsCreateTicket !== savedToolsCreateTicket ||
    toolsBookAppointment !== savedToolsBookAppointment;

  // Notify parent when dirty state changes (for tab-switch discard prompt)
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Sync local state when line props change (e.g. after refresh)
  useEffect(() => {
    setToolsCreateTicket(savedToolsCreateTicket);
    setToolsBookAppointment(savedToolsBookAppointment);
  }, [savedToolsCreateTicket, savedToolsBookAppointment]);

  const handleSaveClick = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setSaveError(null);
    setIsSaving(true);
    const updates: Record<string, unknown> = {};
    if (toolsCreateTicket !== savedToolsCreateTicket) updates.tools_create_ticket = toolsCreateTicket;
    if (toolsBookAppointment !== savedToolsBookAppointment) updates.tools_book_appointment = toolsBookAppointment;
    if (Object.keys(updates).length === 0) {
      setIsSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/phone-lines/${line.id}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUpdate(updates as Partial<LineConfigurationTabProps["line"]>);
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
  }, [
    isDirty,
    isSaving,
    toolsCreateTicket,
    savedToolsCreateTicket,
    toolsBookAppointment,
    savedToolsBookAppointment,
    line.id,
    onUpdate,
    onSaveError,
  ]);

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {saveError}
        </div>
      )}

      {/* Routing Section */}
      <div>
        <h4 className="mb-4 text-sm font-semibold text-navy-700 dark:text-white">Routing</h4>
        <div className="space-y-4">
          {/*
            Business hours are a WORKSPACE setting, not a per-line one: a business has one set of
            opening hours, and offering a second copy here would be two answers to one question.
            This used to be a permanently-checked, permanently-disabled box under "Coming soon" —
            a control that claimed a feature existed and did nothing. It is now a pointer to the
            real setting.
          */}
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-white">Business hours</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Set once for the whole workspace, and used on every channel.{" "}
              <Link
                href="/dashboard/settings/workspace#hours"
                className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
              >
                Opening hours in Settings
              </Link>
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-white">After-hours behaviour</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Chosen alongside your opening hours. This line is answered 24/7 either way — the
              setting only decides whether the AI mentions that your team is away.
            </p>
          </div>
        </div>
      </div>

      {/* Tools Section */}
      <div>
        <h4 className="mb-4 text-sm font-semibold text-navy-700 dark:text-white">Tools</h4>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={toolsCreateTicket}
              onChange={(e) => setToolsCreateTicket(e.target.checked)}
              disabled={isSaving}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-white">
                Create Ticket
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Create support tickets during calls
              </p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={toolsBookAppointment}
              onChange={(e) => setToolsBookAppointment(e.target.checked)}
              disabled={isSaving}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-white">
                Book Appointment
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Book appointments during calls
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Save area: bottom aligned */}
      <div className="flex flex-col gap-2 border-t border-gray-200 pt-6 dark:border-white/10">
        {isDirty && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Unsaved changes</p>
        )}
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
    </div>
  );
}

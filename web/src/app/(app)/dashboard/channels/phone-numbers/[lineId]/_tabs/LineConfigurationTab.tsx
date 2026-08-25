"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface LineConfigurationTabProps {
  line: {
    id: string;
    language_mode: string | null;
    tools_create_ticket: boolean | null;
    tools_book_appointment: boolean | null;
  };
  onUpdate: (updates: Partial<LineConfigurationTabProps["line"]>) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveError?: () => void;
}

export function LineConfigurationTab({ line, onUpdate, onDirtyChange, onSaveError }: LineConfigurationTabProps) {
  const [languageMode, setLanguageMode] = useState(line.language_mode || "auto");
  const [toolsCreateTicket, setToolsCreateTicket] = useState(line.tools_create_ticket ?? true);
  const [toolsBookAppointment, setToolsBookAppointment] = useState(line.tools_book_appointment ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedLanguage = line.language_mode || "auto";
  const savedToolsCreateTicket = line.tools_create_ticket ?? true;
  const savedToolsBookAppointment = line.tools_book_appointment ?? true;

  const isDirty =
    languageMode !== savedLanguage ||
    toolsCreateTicket !== savedToolsCreateTicket ||
    toolsBookAppointment !== savedToolsBookAppointment;

  // Notify parent when dirty state changes (for tab-switch discard prompt)
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Sync local state when line props change (e.g. after refresh)
  useEffect(() => {
    setLanguageMode(savedLanguage);
    setToolsCreateTicket(savedToolsCreateTicket);
    setToolsBookAppointment(savedToolsBookAppointment);
  }, [savedLanguage, savedToolsCreateTicket, savedToolsBookAppointment]);

  const handleSaveClick = useCallback(async () => {
    if (!isDirty || isSaving) return;
    setSaveError(null);
    setIsSaving(true);
    const updates: Record<string, unknown> = {};
    if (languageMode !== savedLanguage) updates.language_mode = languageMode;
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
    languageMode,
    savedLanguage,
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
          <div>
            <label className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked
                disabled
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-1 focus:ring-brand-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-white">
                Business hours
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Coming soon
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
              Language routing
            </label>
            <select
              value={languageMode}
              onChange={(e) => setLanguageMode(e.target.value)}
              disabled={isSaving}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
            >
              <option value="auto">Auto-detect</option>
              <option value="en">English</option>
              <option value="tr">Turkish</option>
            </select>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2">
              <input type="checkbox" checked={false} disabled className="h-4 w-4 rounded border-gray-300 text-gray-400" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Use after-hours behavior
              </span>
            </label>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Coming soon
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

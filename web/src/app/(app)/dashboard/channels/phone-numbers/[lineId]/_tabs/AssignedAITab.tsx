"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface AssignedAITabProps {
  line: {
    id: string;
    first_message: string | null;
  };
  onUpdate: (updates: Partial<AssignedAITabProps["line"]>) => void;
  onSaveError?: () => void;
}

/**
 * The greeting this line answers with.
 *
 * Sprint 9 · T6: three controls were removed from this tab — a "Behavior preset" radio group, a
 * fallback message and an escalation phrase. None of them had a column to save to: they rendered
 * disabled, defaulted to hardcoded local state, and were labelled "Coming soon" while sitting
 * among fields that do persist. A control presented as product functionality must be able to
 * change something.
 *
 * What remains is `phone_lines.first_message`, which is real and saved. Where this tab belongs at
 * all is a Sprint 10 question (employee configuration is being consolidated onto the employee) —
 * this change only stops it lying.
 */
export function AssignedAITab({ line, onUpdate, onSaveError }: AssignedAITabProps) {
  const [firstMessage, setFirstMessage] = useState(line.first_message || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const savedFirstMessage = line.first_message || "";

  const isDirty = firstMessage !== savedFirstMessage;

  useEffect(() => {
    setFirstMessage(savedFirstMessage);
  }, [savedFirstMessage]);

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
    <div className="space-y-6">
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {saveError}
        </div>
      )}

      {/* First message: persisted (phone_lines.first_message) */}
      <div>
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
          rows={4}
          placeholder="Hi, thanks for calling. How can I help you today?"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          What callers hear when the call starts.
        </p>
      </div>

      {/* Save area */}
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

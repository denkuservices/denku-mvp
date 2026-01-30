"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AssignedAITabProps {
  line: {
    id: string;
    first_message: string | null;
  };
  onUpdate: (updates: Partial<AssignedAITabProps["line"]>) => void;
  onSaveError?: () => void;
}

// Behavior preset: no DB column on phone_lines → read-only for now
const BEHAVIOR_PRESETS = [
  { value: "professional-friendly", label: "Professional & friendly" },
  { value: "short-direct", label: "Short & direct" },
  { value: "warm-conversational", label: "Warm & conversational" },
] as const;

export function AssignedAITab({ line, onUpdate, onSaveError }: AssignedAITabProps) {
  const [firstMessage, setFirstMessage] = useState(line.first_message || "");
  const [fallbackMessage, setFallbackMessage] = useState(""); // No DB → local only, read-only
  const [escalationPhrase, setEscalationPhrase] = useState(""); // No DB → local only, read-only
  const [behaviorPreset, setBehaviorPreset] = useState<typeof BEHAVIOR_PRESETS[number]["value"]>("professional-friendly");
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

      {/* Behavior preset: read-only (no DB storage on phone_lines) */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
          Behavior preset
        </label>
        <div className="space-y-2">
          {BEHAVIOR_PRESETS.map((preset) => (
            <label
              key={preset.value}
              className={`flex cursor-not-allowed items-center gap-3 rounded-lg border p-3 opacity-70 ${
                behaviorPreset === preset.value
                  ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20"
                  : "border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5"
              }`}
            >
              <input
                type="radio"
                name="behaviorPreset"
                value={preset.value}
                checked={behaviorPreset === preset.value}
                disabled
                readOnly
                className="h-4 w-4 text-gray-400"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{preset.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Coming soon
        </p>
      </div>

      {/* First message: persisted (phone_lines.first_message) */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
          First message
        </label>
        <textarea
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

      {/* Fallback message: read-only (no DB) */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white">
          If the caller can&apos;t be helped
        </label>
        <textarea
          value={fallbackMessage}
          readOnly
          disabled
          rows={3}
          placeholder="Coming soon"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400"
        />
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Used when no answer or action is possible. Coming soon.
        </p>
      </div>

      {/* Escalation phrase: read-only (no DB) */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-white">
          Escalation phrase
        </label>
        <input
          type="text"
          value={escalationPhrase}
          readOnly
          disabled
          placeholder="Coming soon"
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400"
        />
        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          When the caller says this, the call is escalated. Coming soon.
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

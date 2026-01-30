"use client";

/**
 * ADVANCED TAB — Storage targets (do not invent schema)
 *
 * Read/write (proven storage):
 * - agents.system_prompt_override — via PATCH /api/phone-lines/[lineId]/update-agent-config
 *
 * Read-only (no DB/API today; show "Coming soon" or "Upgrade required"):
 * - Voice, Quality — no update path from phone line context
 * - Maximum call duration, Silence timeout — no columns or update path
 *
 * Provider-agnostic: no provider names or raw telephony IDs in UI.
 */

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AgentForAdvanced } from "../PhoneLineDetailClient";

type LineForAdvanced = {
  id: string;
  status: string | null;
  assigned_agent_id?: string | null;
};

interface AdvancedTabProps {
  lineId: string;
  line: LineForAdvanced;
  orgId: string;
  agentForAdvanced: AgentForAdvanced;
  isPreviewMode?: boolean;
  onSaveToast: () => void;
  onResetToast: () => void;
  onSaveError: () => void;
  onSaved: () => void;
}

/** Lock label: isPreviewMode → "Upgrade required"; else no storage → "Coming soon"; else editable. */
function getLockLabel(isPreviewMode: boolean, fieldSupported: boolean): string {
  if (isPreviewMode) return "Upgrade required";
  if (!fieldSupported) return "Coming soon";
  return "";
}

export function AdvancedTab({
  lineId,
  line,
  orgId,
  agentForAdvanced,
  isPreviewMode = false,
  onSaveToast,
  onResetToast,
  onSaveError,
  onSaved,
}: AdvancedTabProps) {
  const serverSystemPrompt = agentForAdvanced?.system_prompt_override ?? "";
  const [systemInstructions, setSystemInstructions] = useState<string>(serverSystemPrompt);
  const [lastSavedState, setLastSavedState] = useState<string>(serverSystemPrompt);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const v = agentForAdvanced?.system_prompt_override ?? "";
    setSystemInstructions(v);
    setLastSavedState(v);
  }, [agentForAdvanced?.system_prompt_override]);

  const hasStorage = !!agentForAdvanced;
  const canEditAdvanced = !isPreviewMode && hasStorage;
  const isDirty = useMemo(
    () => systemInstructions !== lastSavedState,
    [systemInstructions, lastSavedState]
  );

  const handleSave = async () => {
    if (!isDirty || !canEditAdvanced) return;
    setIsSaving(true);
    try {
      const payload = systemInstructions.trim() || null;
      const res = await fetch(`/api/phone-lines/${lineId}/update-agent-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt_override: payload }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        const savedValue = payload ?? "";
        setLastSavedState(savedValue);
        setSystemInstructions(savedValue);
        onSaveToast();
        onSaved();
      } else {
        onSaveError();
      }
    } catch {
      onSaveError();
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!canEditAdvanced) return;
    setIsResetting(true);
    try {
      const res = await fetch(`/api/phone-lines/${lineId}/update-agent-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_prompt_override: null }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setSystemInstructions("");
        setLastSavedState("");
        setResetModalOpen(false);
        onResetToast();
        onSaved();
      } else {
        onSaveError();
      }
    } catch {
      onSaveError();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Advanced settings
        </h3>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
          Changes here can affect call quality. Recommended for advanced users.
        </p>
      </div>

      {/* Reset to defaults */}
      <div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setResetModalOpen(true)}
          disabled={!canEditAdvanced}
        >
          Reset to defaults
        </Button>
        {!canEditAdvanced && (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {getLockLabel(isPreviewMode, hasStorage)}
          </p>
        )}
      </div>

      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Reset to defaults</DialogTitle>
            <DialogDescription>
              This will clear your system instructions and use the system
              default. You can change them again after saving.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-row justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setResetModalOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleResetToDefaults}
              disabled={isResetting}
            >
              {isResetting ? "Resetting…" : "Reset to defaults"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System instructions — only place for system-level instructions */}
      <section>
        <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
          System instructions
        </h4>
        <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
          System instructions
        </label>
        {canEditAdvanced ? (
          <textarea
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-800 dark:text-white dark:focus:ring-brand-400"
            placeholder="Optional custom instructions for this line…"
          />
        ) : (
          <textarea
            disabled
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/20 dark:bg-navy-700 dark:text-gray-400"
            value={systemInstructions}
            readOnly
          />
        )}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {canEditAdvanced
            ? "Advanced instructions that guide how this line behaves."
            : getLockLabel(isPreviewMode, hasStorage)}
        </p>
      </section>

      {/* Limits — SMB language; no storage → disabled "Coming soon" */}
      <section>
        <h4 className="mb-3 text-sm font-medium text-gray-900 dark:text-white">
          Limits
        </h4>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Maximum call duration (minutes)
            </label>
            <input
              type="number"
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/20 dark:bg-navy-700 dark:text-gray-400"
              placeholder={getLockLabel(isPreviewMode, false)}
              readOnly
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
              Silence timeout (seconds)
            </label>
            <input
              type="number"
              disabled
              className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/20 dark:bg-navy-700 dark:text-gray-400"
              placeholder={getLockLabel(isPreviewMode, false)}
              readOnly
            />
          </div>
        </div>
      </section>

      {/* Save changes (only when editable; purple primary) */}
      {canEditAdvanced && (
        <div className="border-t border-gray-200 pt-4 dark:border-white/10">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateAgentPromptOverride,
  type UpdateAgentPromptOverrideResult,
} from "@/app/(app)/dashboard/settings/_actions/agents";

type Agent = {
  id: string;
  org_id: string;
  name: string;
  system_prompt_override: string | null;
  effective_system_prompt: string | null;
  vapi_assistant_id: string | null;
  vapi_sync_status: string | null;
  vapi_synced_at: string | null;
};

type AgentAdvancedPageProps = {
  agent: Agent;
};

const DEFAULT_PROMPT = `
You are a voice-based AI agent representing the company.
Speak naturally, clearly, and professionally.
If unsure, ask a clarifying question instead of guessing.
Never mention internal systems, AI models, or technical details.
`.trim();

function formatSyncStatus(status: string | null): { label: string; className: string } {
  if (!status) return { label: "Never synced", className: "text-zinc-500" };
  if (status === "success") return { label: "Synced", className: "text-green-600" };
  if (status.startsWith("error:")) {
    return { label: `Error: ${status.replace("error:", "").substring(0, 30)}`, className: "text-red-600" };
  }
  return { label: status, className: "text-zinc-600" };
}

function formatDate(dateIso: string | null): string {
  if (!dateIso) return "—";
  try {
    const d = new Date(dateIso);
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

export function AgentAdvancedContent({ agent: initialAgent }: AgentAdvancedPageProps) {
  const router = useRouter();
  const [customPrompt, setCustomPrompt] = React.useState<string>(initialAgent.system_prompt_override || "");
  const [effectivePrompt, setEffectivePrompt] = React.useState(
    initialAgent.effective_system_prompt || DEFAULT_PROMPT
  );
  const [vapiSyncStatus, setVapiSyncStatus] = React.useState(initialAgent.vapi_sync_status);
  const [vapiSyncedAt, setVapiSyncedAt] = React.useState(initialAgent.vapi_synced_at);

  // Update local state when props change
  React.useEffect(() => {
    setCustomPrompt(initialAgent.system_prompt_override || "");
    setEffectivePrompt(initialAgent.effective_system_prompt || DEFAULT_PROMPT);
    setVapiSyncStatus(initialAgent.vapi_sync_status);
    setVapiSyncedAt(initialAgent.vapi_synced_at);
  }, [initialAgent]);

  // UI state
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  // Compute dirty state
  const isDirty = React.useMemo(() => {
    return customPrompt !== (initialAgent.system_prompt_override || "");
  }, [customPrompt, initialAgent.system_prompt_override]);

  const handleSave = () => {
    if (!isDirty) return;

    startTransition(async () => {
      setStatusMessage(null);

      const result: UpdateAgentPromptOverrideResult = await updateAgentPromptOverride({
        agentId: initialAgent.id,
        system_prompt_override: customPrompt.trim() || null,
      });

      if (result.ok) {
        // Update local state with returned data
        setEffectivePrompt(result.data.effective_system_prompt || DEFAULT_PROMPT);
        setStatusMessage({ type: "success", text: "Settings saved successfully" });
        if (result.data.vapiSyncStatus) {
          setVapiSyncStatus(result.data.vapiSyncStatus);
          if (result.data.vapiSyncStatus === "success" && result.data.vapi_synced_at) {
            setVapiSyncedAt(result.data.vapi_synced_at);
          }
        }
        // Revalidate server props
        router.refresh();
        // Clear status after 3 seconds
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        setStatusMessage({ type: "error", text: result.error });
      }
    });
  };

  const handleCancel = () => {
    setCustomPrompt(initialAgent.system_prompt_override || "");
    setStatusMessage(null);
  };

  const handleClear = () => {
    setCustomPrompt("");
  };

  return (
    <>
      {/* Status message */}
      {statusMessage && (
        <div
          className={`mb-6 rounded-2xl border p-4 ${
            statusMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="text-sm font-semibold">{statusMessage.text}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/settings/agents/${initialAgent.id}`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Agent defaults
        </Link>

        <span className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Advanced</span>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-900">Warning</p>
          <p className="mt-1 text-xs text-amber-900/80">
            Advanced overrides can reduce predictability. Clear the override to revert to defaults.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900">System prompt override</p>
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={DEFAULT_PROMPT}
            rows={12}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono leading-6 shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">Leave empty to use defaults.</p>
            <button
              type="button"
              onClick={handleClear}
              disabled={!customPrompt.trim()}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear override
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900">Effective prompt (read-only)</p>
          <textarea
            readOnly
            value={effectivePrompt}
            rows={8}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono leading-6 text-zinc-700"
          />
        </div>

        {/* Sync status */}
        {initialAgent.vapi_assistant_id && (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-zinc-900">Vapi sync</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600">Status</span>
              <span className={`text-xs font-semibold ${formatSyncStatus(vapiSyncStatus).className}`}>
                {formatSyncStatus(vapiSyncStatus).label}
              </span>
            </div>
            {vapiSyncedAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600">Last synced</span>
                <span className="text-xs font-semibold text-zinc-900">{formatDate(vapiSyncedAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* Save/Cancel buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
          <button
            onClick={handleCancel}
            disabled={!isDirty || isPending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || isPending}
            className="rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </>
  );
}

"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  updateAgentConfiguration,
  type UpdateAgentConfigResult,
} from "@/app/(app)/dashboard/settings/_actions/agents";
import type { EmployeeConfig } from "@/lib/platform/readModel/employeeProfile";
import { Surface, CONTROL_CLASS } from "../ui";
import {
  BUSINESS_CONTEXT_FIELDS,
  toSetupFormState,
  toUpdateAgentConfigPayload,
  type BusinessContext,
} from "./setupFields";

/**
 * Knowledge — what this employee knows about the business (Sprint 10 / R-094).
 *
 * The eight business-context fields, moved off the Settings agent page. What you write here is
 * what the employee can say on a call: the action folds it into the derived system prompt.
 *
 * Saves through the same `updateAgentConfiguration` action as Setup, resending the employee's
 * current Setup values alongside the edited context — the action re-derives the prompt from the
 * whole payload, so sending a partial one would quietly reset the settings this tab does not own.
 */
export default function KnowledgeForm({
  employee,
  workspaceStatus,
}: {
  employee: EmployeeConfig;
  workspaceStatus: "active" | "paused";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = React.useState<{ type: "success" | "error"; text: string } | null>(null);

  const initial = React.useMemo(
    () =>
      toSetupFormState({
        name: employee.name,
        language: employee.language,
        timezone: employee.timezone,
        behaviorPreset: employee.behaviorPreset,
        agentType: employee.agentType,
        firstMessage: employee.firstMessage,
        emphasisPoints: employee.emphasisPoints,
        businessContext: employee.businessContext,
      }),
    [employee]
  );

  const [context, setContext] = React.useState<BusinessContext>(initial.businessContext);

  React.useEffect(() => {
    setContext(initial.businessContext);
  }, [initial.businessContext]);

  const paused = workspaceStatus === "paused";
  const isDirty = JSON.stringify(context) !== JSON.stringify(initial.businessContext);
  const hasOverride = Boolean((employee.systemPromptOverride ?? "").trim());

  const handleSave = () => {
    if (!isDirty || isPending || paused) return;
    startTransition(async () => {
      setStatus(null);
      const result: UpdateAgentConfigResult = await updateAgentConfiguration(
        toUpdateAgentConfigPayload(employee.id, { ...initial, businessContext: context })
      );
      if (result.ok) {
        setStatus({
          type: "success",
          text:
            result.data.vapiSyncStatus && result.data.vapiSyncStatus.startsWith("error:")
              ? `Saved, but syncing to the phone system failed: ${result.data.vapiSyncStatus
                  .replace("error:", "")
                  .trim()}`
              : "Saved. Your AI employee knows this now.",
        });
        router.refresh();
      } else {
        setStatus({ type: "error", text: result.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      {paused ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This workspace is paused, so knowledge can&apos;t be changed. Resume it to edit.
        </p>
      ) : null}

      {/* An active override means nothing typed here reaches the caller. Saying so is the
          honest thing; letting someone fill in eight fields that do nothing is not. */}
      {hasOverride ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          A system prompt override is active, so this employee is not using the details below.
          Clear it under Setup → Advanced for these to take effect again.
        </p>
      ) : null}

      {status ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          }`}
        >
          {status.text}
        </p>
      ) : null}

      <Surface>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {BUSINESS_CONTEXT_FIELDS.map((field) => (
            <div key={field.key} className={field.multiline ? "sm:col-span-2" : undefined}>
              <label
                htmlFor={`bc-${field.key}`}
                className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white"
              >
                {field.label}
              </label>
              {field.multiline ? (
                <textarea
                  id={`bc-${field.key}`}
                  value={context[field.key]}
                  onChange={(e) => setContext((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  disabled={paused}
                  rows={4}
                  className={`${CONTROL_CLASS} h-auto w-full py-2`}
                />
              ) : (
                <input
                  id={`bc-${field.key}`}
                  type="text"
                  value={context[field.key]}
                  onChange={(e) => setContext((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  disabled={paused}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
              <p className="mt-1 text-xs text-gray-500">{field.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isPending || paused}
            title={paused ? "Workspace is paused" : undefined}
            className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
          {isDirty && !paused ? <span className="text-xs text-gray-500">Unsaved changes</span> : null}
        </div>
      </Surface>
    </div>
  );
}

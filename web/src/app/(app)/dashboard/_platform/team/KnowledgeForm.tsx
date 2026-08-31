"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Sparkles, Loader2 } from "lucide-react";
import {
  updateAgentConfiguration,
  type UpdateAgentConfigResult,
} from "@/app/(app)/dashboard/settings/_actions/agents";
import type { EmployeeConfig } from "@/lib/platform/readModel/employeeProfile";
import { Surface, CONTROL_CLASS } from "../ui";
import { draftKnowledgeAction } from "./_actions/draftKnowledge";
import { examplesForTimezone } from "./knowledgeExamples";
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
  /**
   * Confirmation on the button itself, not only in the banner at the top of the page.
   *
   * After filling eight fields the eye is at the bottom of the form; a success message that
   * appears above the fold is a message that gets missed, and the customer sits waiting for
   * something that already happened.
   */
  const [justSaved, setJustSaved] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  /**
   * Placeholder examples for wherever the reader actually is.
   *
   * Resolved after mount so the server and the first client render agree; until then the
   * employee's own saved timezone stands, which is usually already right.
   */
  const [zone, setZone] = React.useState<string | null>(employee.timezone ?? null);
  React.useEffect(() => {
    try {
      setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || employee.timezone || null);
    } catch {
      // Keep the employee's saved zone.
    }
  }, [employee.timezone]);
  const examples = React.useMemo(() => examplesForTimezone(zone), [zone]);
  /** True once a draft has been loaded, so the form can say these words are not saved yet. */
  const [draftLoaded, setDraftLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

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

  /**
   * Fill the fields from what the workspace already said about itself.
   *
   * Only ever fills fields the owner has left EMPTY. Overwriting something they typed would make
   * the button dangerous to press, and a button you have to think twice about is one nobody uses.
   */
  const handleDraft = () => {
    if (drafting || paused) return;
    setDrafting(true);
    setStatus(null);
    startTransition(async () => {
      const result = await draftKnowledgeAction();
      setDrafting(false);
      if (!result.ok) {
        setStatus({ type: "error", text: result.error });
        return;
      }
      setContext((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(result.draft)) {
          const k = key as keyof BusinessContext;
          if (!String(prev[k] ?? "").trim() && value.trim()) next[k] = value;
        }
        return next;
      });
      setDraftLoaded(true);
      setStatus({
        type: "success",
        text:
          result.usedQuestions > 0
            ? `Drafted from what you told us and ${result.usedQuestions} real customer ${
                result.usedQuestions === 1 ? "question" : "questions"
              }. Read it over — nothing is saved until you press Save.`
            : "Drafted from what you told us. Read it over — nothing is saved until you press Save.",
      });
    });
  };

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
        setJustSaved(true);
        setDraftLoaded(false);
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
        <p className="mb-5 text-sm text-gray-600 dark:text-gray-300">
          What you write here is what your AI can say. It will never invent a fact it was not
          given, so anything left blank becomes a ticket for you instead of an answer.
        </p>
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
                  placeholder={examples[field.key]}
                  className={`${CONTROL_CLASS} h-auto w-full py-2`}
                />
              ) : (
                <input
                  id={`bc-${field.key}`}
                  type="text"
                  value={context[field.key]}
                  onChange={(e) => setContext((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  disabled={paused}
                  placeholder={examples[field.key]}
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
            className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed ${
              justSaved
                ? "bg-green-600 disabled:opacity-100"
                : "bg-brand-500 hover:bg-brand-600 disabled:opacity-50"
            }`}
          >
            {isPending ? (
              "Saving…"
            ) : justSaved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              "Save changes"
            )}
          </button>
          <button
            type="button"
            onClick={handleDraft}
            disabled={drafting || isPending || paused}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-navy-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5"
          >
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {drafting ? "Drafting…" : "Draft with AI"}
          </button>
          {isDirty && !paused ? (
            <span className="text-xs text-gray-500">
              {draftLoaded ? "Draft ready — review and save" : "Unsaved changes"}
            </span>
          ) : null}
        </div>
      </Surface>
    </div>
  );
}

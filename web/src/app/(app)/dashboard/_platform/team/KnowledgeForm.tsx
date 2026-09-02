"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles, Loader2, Upload } from "lucide-react";
import {
  updateAgentConfiguration,
  type UpdateAgentConfigResult,
} from "@/app/(app)/dashboard/settings/_actions/agents";
import type { EmployeeConfig } from "@/lib/platform/readModel/employeeProfile";
import { Surface, CONTROL_CLASS } from "../ui";
import SaveButton, { useSavedFlash } from "../ui/SaveButton";
import { draftKnowledgeAction } from "./_actions/draftKnowledge";
import { knowledgeExamples } from "./knowledgeExamples";
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
   * something that already happened. Shared with Setup, so every tab confirms the same way.
   */
  const { saved: justSaved, flashSaved } = useSavedFlash();
  /** True only while the Save write is in flight — drafting and uploading share the transition. */
  const [saving, setSaving] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  /**
   * The placeholder examples.
   *
   * Website facts are deliberately NOT merged in here. They reach the fields through "Draft with
   * AI", as real values a person reviews and saves — which keeps one meaning per appearance: grey
   * is an example, black is your answer. Showing a fact from someone's own site as a placeholder
   * would leave them believing it was already saved, which is the same confusion in a politer
   * costume.
   */
  const examples = knowledgeExamples();
  /** True once a draft has been loaded, so the form can say these words are not saved yet. */
  const [draftLoaded, setDraftLoaded] = React.useState(false);

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

  /**
   * Learn the business from a document the owner already has.
   *
   * The same fill rule as "Draft with AI", for the same reason: only EMPTY fields are filled, so
   * the button is never dangerous to press and uploading a second document adds to the picture
   * instead of rewriting it. The owner's own words outrank a machine reading of a PDF, always.
   *
   * Nothing is saved by the upload. What comes back is shown in the fields for a person to read
   * before it becomes something their customers hear spoken aloud.
   */
  const handleUpload = (file: File) => {
    if (uploading || paused) return;
    setUploading(true);
    setStatus(null);

    startTransition(async () => {
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("agentId", employee.id);

        const res = await fetch("/api/knowledge/document", { method: "POST", body });
        const data = await res.json().catch(() => null);
        setUploading(false);

        if (!res.ok || !data?.ok) {
          setStatus({ type: "error", text: data?.error || "We couldn't read that file." });
          return;
        }

        const fields = (data.suggestion?.fields ?? {}) as Partial<BusinessContext>;
        let filled = 0;
        setContext((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(fields)) {
            const k = key as keyof BusinessContext;
            if (!String(prev[k] ?? "").trim() && String(value ?? "").trim()) {
              next[k] = String(value);
              filled += 1;
            }
          }
          return next;
        });
        setDraftLoaded(true);

        const missing = (data.suggestion?.missing ?? []).length as number;
        setStatus({
          type: "success",
          text:
            filled > 0
              ? `Read ${data.filename}${data.pageCount ? ` (${data.pageCount} pages)` : ""} and filled ${filled} ${
                  filled === 1 ? "field" : "fields"
                }.${missing > 0 ? ` ${missing} left blank — the document did not say.` : ""} Read it over; nothing is saved until you press Save.`
              : `Read ${data.filename}, but it did not state anything for these fields. Nothing was changed.`,
        });
      } catch {
        setUploading(false);
        setStatus({ type: "error", text: "We couldn't read that file. Please try again." });
      }
    });
  };

  const handleSave = () => {
    if (!isDirty || isPending || paused) return;
    setSaving(true);
    startTransition(async () => {
      setStatus(null);
      const result: UpdateAgentConfigResult = await updateAgentConfiguration(
        toUpdateAgentConfigPayload(employee.id, { ...initial, businessContext: context })
      );
      setSaving(false);
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
        flashSaved();
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
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
          What you write here is what your AI can say. It will never invent a fact it was not
          given, so anything left blank becomes a ticket for you instead of an answer.
        </p>

        <div className="mb-5 rounded-xl border border-dashed border-gray-300 p-4 dark:border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-navy-700 dark:text-white">
                Have this written down already?
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Upload a price list, a services page or a policy document (PDF or text, up to
                10&nbsp;MB). We fill in what it says and leave the rest blank — nothing is saved
                until you press Save.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Cleared so choosing the same file twice fires again — the second attempt is
                // usually the interesting one, after a failure.
                e.target.value = "";
                if (file) handleUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || paused || isPending}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-navy-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white dark:hover:bg-white/5"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Reading…" : "Upload a document"}
            </button>
          </div>
        </div>
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
          <SaveButton
            onClick={handleSave}
            saving={saving}
            saved={justSaved}
            dirty={isDirty}
            disabled={isPending || paused}
            title={paused ? "Workspace is paused" : undefined}
          />
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

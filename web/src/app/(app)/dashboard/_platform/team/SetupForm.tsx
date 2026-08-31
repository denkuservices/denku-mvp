"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, X } from "lucide-react";
import {
  updateAgentConfiguration,
  updateAgentPromptOverride,
  type UpdateAgentConfigResult,
  type UpdateAgentPromptOverrideResult,
} from "@/app/(app)/dashboard/settings/_actions/agents";
import { LANGUAGES, toLanguageCode } from "@/lib/language/registry";
import type { EmployeeConfig } from "@/lib/platform/readModel/employeeProfile";
import { Surface, CONTROL_CLASS } from "../ui";
import TimezoneField from "../TimezoneField";
import {
  ADDITIONAL_LANGUAGE_OPTIONS,
  AGENT_TYPES,
  PRESETS,
  SETUP_LANGUAGES,
  toSetupFormState,
  toUpdateAgentConfigPayload,
  type SetupFormState,
} from "./setupFields";

/**
 * Setup — the employee editor (Sprint 10 / R-094).
 *
 * This is the form that used to live at Settings → Agents → [id]. It moved here because the
 * employee is what a customer thinks they are configuring; Settings owned it only because that
 * is where it was first built. Four surfaces could write this row, one of them a phone-line tab.
 * Now there is one.
 *
 * **The write path did not move with it.** Both server actions are called exactly as before —
 * they own validation, the owner/admin gate, the paused-workspace gate, prompt derivation, the
 * Vapi sync and the audit log. Every value collapse (`"English"` → null, preset label → id) is
 * in `setupFields.ts` and is pinned by the parity test, because those values feed the derived
 * system prompt a live assistant speaks from.
 *
 * The prompt override sits behind an `<details>` disclosure rather than a separate page: it is
 * the one place "agent" language is sanctioned, and it is genuinely dangerous — a saved override
 * means the employee stops following the business details above it.
 */
export default function SetupForm({
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
        additionalLanguages: employee.additionalLanguages,
        timezone: employee.timezone,
        behaviorPreset: employee.behaviorPreset,
        agentType: employee.agentType,
        firstMessage: employee.firstMessage,
        emphasisPoints: employee.emphasisPoints,
        businessContext: employee.businessContext,
      }),
    [employee]
  );

  const [form, setForm] = React.useState<SetupFormState>(initial);
  const [newPoint, setNewPoint] = React.useState("");
  const [override, setOverride] = React.useState(employee.systemPromptOverride ?? "");

  // Re-sync when the server sends fresh props (after router.refresh()).
  React.useEffect(() => {
    setForm(initial);
    setOverride(employee.systemPromptOverride ?? "");
  }, [initial, employee.systemPromptOverride]);

  const paused = workspaceStatus === "paused";

  /** Say "English", never the stored "en" — the picker shows names, so the hint must too. */
  const primaryLanguageLabel =
    LANGUAGES[toLanguageCode(form.language) ?? "en"]?.label ?? form.language;

  const isDirty =
    form.language !== initial.language ||
    JSON.stringify([...form.additionalLanguages].sort()) !==
      JSON.stringify([...initial.additionalLanguages].sort()) ||
    form.timezone !== initial.timezone ||
    form.behaviorPresetId !== initial.behaviorPresetId ||
    form.agentType !== initial.agentType ||
    form.firstMessage !== initial.firstMessage ||
    JSON.stringify(form.emphasisPoints) !== JSON.stringify(initial.emphasisPoints);

  const overrideDirty = override !== (employee.systemPromptOverride ?? "");

  const set = <K extends keyof SetupFormState>(key: K, value: SetupFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addPoint = () => {
    const v = newPoint.trim();
    if (!v) return;
    set("emphasisPoints", [...form.emphasisPoints, v]);
    setNewPoint("");
  };

  const handleSave = () => {
    if (!isDirty || isPending || paused) return;
    startTransition(async () => {
      setStatus(null);
      // business_context is owned by the Knowledge tab; send what is stored so a Setup save
      // never blanks it (the action only overwrites the key when it is present).
      const result: UpdateAgentConfigResult = await updateAgentConfiguration(
        toUpdateAgentConfigPayload(employee.id, { ...form, businessContext: initial.businessContext })
      );
      if (result.ok) {
        setStatus({ type: "success", text: syncNote(result.data.vapiSyncStatus) });
        router.refresh();
      } else {
        setStatus({ type: "error", text: result.error });
      }
    });
  };

  const handleSaveOverride = () => {
    if (!overrideDirty || isPending || paused) return;
    startTransition(async () => {
      setStatus(null);
      const result: UpdateAgentPromptOverrideResult = await updateAgentPromptOverride({
        agentId: employee.id,
        system_prompt_override: override.trim() || null,
      });
      if (result.ok) {
        setStatus({ type: "success", text: syncNote(result.data.vapiSyncStatus) });
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
          This workspace is paused, so configuration can&apos;t be changed. Resume it to edit.
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
          <Field label="Language">
            <select
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              disabled={paused}
              className={`${CONTROL_CLASS} w-full`}
            >
              {SETUP_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          {/*
            Everything the employee should ALSO understand.

            Ticking one is the whole multilingual decision — there is no second, more technical
            switch, because the two answers could then disagree. The primary is filtered out: it
            is already spoken, and "also English" under a dropdown reading English is nonsense.
          */}
          {/*
            The hint names the one trade-off that is real, and stays quiet about the one that is
            not. Ticking the FIRST extra language moves the transcriber off the model pinned to
            the primary language and onto code-switching, which costs a little accuracy in the
            primary — that is a decision an owner should get to make knowingly. Ticking a second
            or third changes nothing further: the config is identical from one extra onwards. So
            there is no "each language costs you more" warning here, because that would not be
            true.
          */}
          <Field
            label="Also understands"
            hint={`Tick any language it should answer in besides ${primaryLanguageLabel}. The first tick switches listening from ${primaryLanguageLabel} alone to code-switching, which is slightly less accurate for ${primaryLanguageLabel}. Ticking more after that costs nothing extra.`}
          >
            {/*
              Checkboxes, not toggle pills.

              The pills that were here read as status badges rather than controls — with two
              supported languages the whole section rendered as a lone grey word, and nothing said
              it could be clicked. A checkbox is the one control every person already knows means
              "tick this to include it", and the whole row is the hit area.
            */}
            <div className="space-y-2">
              {ADDITIONAL_LANGUAGE_OPTIONS.filter(
                (opt) => opt.code !== toLanguageCode(form.language)
              ).map((opt) => {
                const on = form.additionalLanguages.includes(opt.code);
                return (
                  <label
                    key={opt.code}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                      paused
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5"
                    } ${
                      on
                        ? "border-brand-500 bg-brand-50/60 dark:border-brand-400 dark:bg-brand-500/10"
                        : "border-gray-200 dark:border-white/10"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={paused}
                      onChange={() =>
                        set(
                          "additionalLanguages",
                          on
                            ? form.additionalLanguages.filter((l) => l !== opt.code)
                            : [...form.additionalLanguages, opt.code]
                        )
                      }
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500 disabled:cursor-not-allowed dark:border-white/20 dark:bg-navy-900"
                    />
                    <span className="text-sm text-navy-700 dark:text-white">{opt.label}</span>
                  </label>
                );
              })}
            </div>
            {/*
              Say the resulting behaviour in both states. "Nothing ticked" is a real answer an
              owner chose, and leaving it blank made the control look unfinished rather than off.
            */}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {form.additionalLanguages.length > 0
                ? `It starts every call in ${primaryLanguageLabel} and switches if the caller speaks ${form.additionalLanguages
                    .map((c) => LANGUAGES[c as keyof typeof LANGUAGES]?.label ?? c)
                    .join(" or ")}.`
                : `On calls it only speaks ${primaryLanguageLabel}.`}{" "}
              {/*
                These checkboxes are a VOICE limit — a language needs an ear that transcribes it
                and a mouth that speaks it. Chat has neither constraint and the prompt already
                tells the AI to follow the customer's language, so saying only the voice half
                left owners thinking their AI could not read a message in Turkish.
              */}
              In chat it replies in whichever language the customer writes in.
            </p>
          </Field>

          {/* A real list rather than a free-text box: this value decides what "tomorrow" means
              when the AI books, and a typo here is a mis-booked appointment nobody can see. */}
          <TimezoneField
            id="setup-timezone"
            value={form.timezone}
            onChange={(z) => set("timezone", z)}
            disabled={paused}
          />

          <Field label="Role">
            <select
              value={form.agentType}
              onChange={(e) => set("agentType", e.target.value)}
              disabled={paused}
              className={`${CONTROL_CLASS} w-full`}
            >
              <option value="">Not set</option>
              {AGENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Personality">
            <select
              value={form.behaviorPresetId ?? ""}
              onChange={(e) => set("behaviorPresetId", e.target.value || null)}
              disabled={paused}
              className={`${CONTROL_CLASS} w-full`}
            >
              <option value="">Not set</option>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Opening line" hint="The first thing a caller hears.">
            <textarea
              value={form.firstMessage}
              onChange={(e) => set("firstMessage", e.target.value)}
              disabled={paused}
              rows={3}
              className={`${CONTROL_CLASS} h-auto w-full py-2`}
            />
            {/*
              The opening line is a sentence, not a setting — the AI says it exactly as typed and
              nothing translates it. Change the language above and this text stays as it was, so
              the employee would greet in the old language and switch on the caller's first reply.
              Cheap to say out loud, confusing to discover on a live call.
            */}
            {form.language !== initial.language && form.firstMessage === initial.firstMessage ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                This is still written in {initial.language}. It is said exactly as typed — rewrite
                it in {form.language} if that is what callers should hear first.
              </p>
            ) : null}
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Emphasis points" hint="Things it should always remember to do.">
            <div className="flex flex-wrap gap-2">
              {form.emphasisPoints.map((point, i) => (
                <span
                  key={`${point}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-navy-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                >
                  {point}
                  <button
                    type="button"
                    onClick={() => set("emphasisPoints", form.emphasisPoints.filter((_, idx) => idx !== i))}
                    disabled={paused}
                    aria-label={`Remove ${point}`}
                    className="text-gray-400 transition hover:text-red-500 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {form.emphasisPoints.length === 0 ? (
                <span className="text-sm text-gray-500">None yet.</span>
              ) : null}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newPoint}
                onChange={(e) => setNewPoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPoint();
                  }
                }}
                disabled={paused}
                placeholder="e.g. Always confirm the address"
                aria-label="New emphasis point"
                className={`${CONTROL_CLASS} flex-1`}
              />
              <button
                type="button"
                onClick={addPoint}
                disabled={paused || !newPoint.trim()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-gray-200"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </Field>
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
          <span className="ml-auto text-xs text-gray-400">{syncLabel(employee)}</span>
        </div>
      </Surface>

      {/* Advanced — the sanctioned "agent" context, and the one control that can override
          everything above it. Collapsed by default so it is a deliberate choice to open. */}
      <Surface>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-navy-700 marker:content-none dark:text-white">
            <span className="inline-flex items-center gap-2">
              <span className="text-gray-400 transition group-open:rotate-90">▸</span>
              Advanced — system prompt override
            </span>
          </summary>

          <div className="mt-4 space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Replaces the instructions Denku writes from the settings above and the business
              details in Knowledge. While this is set, changes there stop affecting how this
              employee answers. Leave it empty unless you need full control.
            </p>

            {employee.systemPromptOverride ? (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                An override is active right now.
              </p>
            ) : null}

            <textarea
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              disabled={paused}
              rows={10}
              placeholder="Leave empty to use the instructions derived from Setup and Knowledge."
              aria-label="System prompt override"
              className={`${CONTROL_CLASS} h-auto w-full py-2 font-mono text-xs`}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveOverride}
                disabled={!overrideDirty || isPending || paused}
                className="inline-flex h-10 items-center rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-200"
              >
                {isPending ? "Saving…" : "Save override"}
              </button>
              {override.trim() && !paused ? (
                <button
                  type="button"
                  onClick={() => setOverride("")}
                  disabled={isPending}
                  className="text-sm font-medium text-gray-500 transition hover:text-red-600 disabled:opacity-50"
                >
                  Clear
                </button>
              ) : null}
            </div>

            {employee.effectiveSystemPrompt ? (
              <div className="mt-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Instructions in effect now
                </p>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                  {employee.effectiveSystemPrompt}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      </Surface>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

/** Report the sync outcome honestly — a failed Vapi push is not a successful save. */
function syncNote(vapiSyncStatus: string | null): string {
  if (vapiSyncStatus && vapiSyncStatus.startsWith("error:")) {
    return `Saved, but syncing to the phone system failed: ${vapiSyncStatus.replace("error:", "").trim()}`;
  }
  return "Saved. Your AI employee is using the new settings.";
}

function syncLabel(employee: EmployeeConfig): string {
  if (!employee.vapiSyncStatus) return "Never synced";
  if (employee.vapiSyncStatus.startsWith("error:")) return "Last sync failed";
  if (!employee.vapiSyncedAt) return "Synced";
  try {
    return `Synced ${new Date(employee.vapiSyncedAt).toLocaleString()}`;
  } catch {
    return "Synced";
  }
}

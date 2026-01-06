"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAgentConfiguration, type UpdateAgentConfigResult } from "@/app/(app)/dashboard/settings/_actions/agents";
import { getTimeZoneOptions } from "@/app/(app)/dashboard/settings/_lib/options";

type Agent = {
  id: string;
  org_id: string;
  name: string;
  language: string | null;
  voice: string | null;
  timezone: string | null;
  behavior_preset: string | null;
  agent_type: string | null;
  first_message: string | null;
  emphasis_points: string[] | null;
  system_prompt_override: string | null;
  effective_system_prompt: string | null;
  vapi_assistant_id: string | null;
  vapi_sync_status: string | null;
  vapi_synced_at: string | null;
  created_at: string;
  updated_at: string | null;
};

type AgentConfigurePageProps = {
  agent: Agent;
  workspaceStatus: "active" | "paused";
};

type AgentStatus = "active" | "paused" | "draft" | "error";

const LANGUAGE_CHIPS = [
  { code: "EN", name: "English", title: "English" },
  { code: "ES", name: "Spanish", title: "Spanish" },
  { code: "FR", name: "French", title: "French" },
  { code: "DE", name: "German", title: "German" },
  { code: "TR", name: "Turkish", title: "Turkish" },
];

const ALL_LANGUAGES = [
  ...LANGUAGE_CHIPS.map((l) => l.name),
  // later: add more languages here
];

type PresetOption = {
  id: string;
  label: string;
  short: string;
  desc: string;
};

const PRESETS: PresetOption[] = [
  {
    id: "professional",
    label: "Professional & Courteous",
    short: "Professional",
    desc: "Polite, concise, and consistent. Ideal default for most teams.",
  },
  {
    id: "support",
    label: "Calm Support Specialist",
    short: "Support",
    desc: "Patient, empathetic troubleshooting with clear next steps.",
  },
  {
    id: "concierge",
    label: "Warm Concierge",
    short: "Concierge",
    desc: "Friendly and welcoming. Great for booking and customer care.",
  },
  {
    id: "sales",
    label: "Confident Sales Closer",
    short: "Sales",
    desc: "Value-led, objection handling, and proactive conversion language.",
  },
  {
    id: "direct",
    label: "Direct & Efficient",
    short: "Direct",
    desc: "Fast, minimal small talk. Optimized for speed and accuracy.",
  },
  {
    id: "custom",
    label: "Custom",
    short: "Custom",
    desc: "Use Advanced to fully control the system prompt and rules.",
  },
];

const AGENT_TYPES = [
  { value: "support", label: "Support" },
  { value: "sales", label: "Sales" },
  { value: "concierge", label: "Concierge" },
  { value: "general", label: "General" },
];

function presetMeta(presetId: string | null): PresetOption {
  if (!presetId) return PRESETS[0];
  const found = PRESETS.find((p) => p.id === presetId);
  return found || PRESETS[0];
}

function statusPill(status: AgentStatus) {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-zinc-900 text-white border-zinc-200" };
    case "paused":
      return { label: "Paused", className: "bg-white text-zinc-700 border-zinc-200" };
    case "draft":
      return { label: "Draft", className: "bg-zinc-50 text-zinc-700 border-zinc-200" };
    case "error":
      return { label: "Needs attention", className: "bg-red-50 text-red-700 border-red-200" };
  }
}

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

/**
 * Normalize emphasis_points to always be a string[]
 * Handles: null, undefined, string (JSON or plain), array, other
 */
function normalizeEmphasisPoints(input: unknown): string[] {
  // null or undefined => empty array
  if (input === null || input === undefined) {
    return [];
  }

  // Already an array => validate and clean
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (typeof item === "number") return String(item);
        return String(item || "");
      })
      .filter((item) => item.length > 0);
  }

  // String => try to parse as JSON, otherwise treat as single item
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return [];

    // Try parsing as JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (typeof item === "string") return item.trim();
            if (typeof item === "number") return String(item);
            return String(item || "");
          })
          .filter((item) => item.length > 0);
      }
      // If parsed but not array, treat as single item
      return [String(parsed).trim()].filter((item) => item.length > 0);
    } catch {
      // Not valid JSON, treat as single string item
      return [trimmed].filter((item) => item.length > 0);
    }
  }

  // Other types => empty array
  return [];
}

export function AgentConfigurePage({ agent: initialAgent }: AgentConfigurePageProps) {
  const router = useRouter();
  const agentStatus: AgentStatus = "active";
  const pill = statusPill(agentStatus);

  // Local agent state (initialized from props, updated on save)
  const [agentState, setAgentState] = React.useState<Agent>(initialAgent);
  const [effectivePrompt, setEffectivePrompt] = React.useState(initialAgent.effective_system_prompt);

  // Form state
  const [language, setLanguage] = React.useState(agentState.language || "English");
  const [timezone, setTimezone] = React.useState(agentState.timezone || "UTC");
  const [behaviorPreset, setBehaviorPreset] = React.useState(
    agentState.behavior_preset ? presetMeta(agentState.behavior_preset).label : "Professional & Courteous"
  );
  const [agentType, setAgentType] = React.useState(agentState.agent_type || "");
  const [firstMessage, setFirstMessage] = React.useState(
    agentState.first_message || `Hello, thanks for calling ${agentState.name}. How can I help you today?`
  );
  const [emphasisPoints, setEmphasisPoints] = React.useState<string[]>(
    normalizeEmphasisPoints(agentState.emphasis_points)
  );
  const [newEmphasisPoint, setNewEmphasisPoint] = React.useState("");

  // UI state
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = React.useState<{ type: "success" | "error"; text: string } | null>(null);
  const [vapiSyncStatus, setVapiSyncStatus] = React.useState(agentState.vapi_sync_status);
  const [vapiSyncedAt, setVapiSyncedAt] = React.useState(agentState.vapi_synced_at);

  // Update local state when props change (e.g., after router.refresh())
  React.useEffect(() => {
    setAgentState(initialAgent);
    setEffectivePrompt(initialAgent.effective_system_prompt);
    setLanguage(initialAgent.language || "English");
    setTimezone(initialAgent.timezone || "UTC");
    setBehaviorPreset(
      initialAgent.behavior_preset ? presetMeta(initialAgent.behavior_preset).label : "Professional & Courteous"
    );
    setAgentType(initialAgent.agent_type || "");
    setFirstMessage(
      initialAgent.first_message || `Hello, thanks for calling ${initialAgent.name}. How can I help you today?`
    );
    setEmphasisPoints(normalizeEmphasisPoints(initialAgent.emphasis_points));
    setVapiSyncStatus(initialAgent.vapi_sync_status);
    setVapiSyncedAt(initialAgent.vapi_synced_at);
  }, [initialAgent]);

  // Compute dirty state
  const isDirty = React.useMemo(() => {
    const presetId = PRESETS.find((p) => p.label === behaviorPreset)?.id || null;
    return (
      language !== (agentState.language || "English") ||
      timezone !== (agentState.timezone || "UTC") ||
      presetId !== agentState.behavior_preset ||
      agentType !== (agentState.agent_type || "") ||
      firstMessage !== (agentState.first_message || `Hello, thanks for calling ${agentState.name}. How can I help you today?`) ||
      JSON.stringify(emphasisPoints) !== JSON.stringify(normalizeEmphasisPoints(agentState.emphasis_points))
    );
  }, [language, timezone, behaviorPreset, agentType, firstMessage, emphasisPoints, agentState]);

  const selectedPreset = presetMeta(PRESETS.find((p) => p.label === behaviorPreset)?.id || null);

  const handleSave = () => {
    if (!isDirty) return;

    startTransition(async () => {
      setStatusMessage(null);

      const presetId = PRESETS.find((p) => p.label === behaviorPreset)?.id || null;

      const result: UpdateAgentConfigResult = await updateAgentConfiguration({
        agentId: agentState.id,
        language: language === "English" ? null : language,
        timezone: timezone === "UTC" ? null : timezone,
        behavior_preset: presetId,
        agent_type: agentType || null,
        first_message: firstMessage || null,
        emphasis_points: emphasisPoints.length > 0 ? emphasisPoints : null,
      });

      if (result.ok) {
        // Normalize emphasis_points before updating state
        const normalizedEmphasisPoints = normalizeEmphasisPoints(result.data.emphasis_points);
        
        // Update local agent state with returned data
        setAgentState((prev) => ({
          ...prev,
          language: result.data.language,
          timezone: result.data.timezone,
          behavior_preset: result.data.behavior_preset,
          agent_type: result.data.agent_type,
          first_message: result.data.first_message,
          emphasis_points: normalizedEmphasisPoints,
        }));
        setEmphasisPoints(normalizedEmphasisPoints);
        setEffectivePrompt(result.data.effective_system_prompt);
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
    setLanguage(agentState.language || "English");
    setTimezone(agentState.timezone || "UTC");
    setBehaviorPreset(
      agentState.behavior_preset ? presetMeta(agentState.behavior_preset).label : "Professional & Courteous"
    );
    setAgentType(agentState.agent_type || "");
    setFirstMessage(
      agentState.first_message || `Hello, thanks for calling ${agentState.name}. How can I help you today?`
    );
    setEmphasisPoints(normalizeEmphasisPoints(agentState.emphasis_points));
    setStatusMessage(null);
  };

  const addEmphasisPoint = () => {
    if (newEmphasisPoint.trim()) {
      setEmphasisPoints([...emphasisPoints, newEmphasisPoint.trim()]);
      setNewEmphasisPoint("");
    }
  };

  const removeEmphasisPoint = (index: number) => {
    setEmphasisPoints(emphasisPoints.filter((_, i) => i !== index));
  };

  const timezoneOptions = React.useMemo(() => getTimeZoneOptions(), []);

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

      {/* Header strip */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-2xl font-semibold text-zinc-900">{agentState.name}</p>

              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${pill.className}`}
              >
                {pill.label}
              </span>

              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                {timezone || "UTC"}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 md:flex-row md:items-center md:gap-3">
              <span className="font-mono text-zinc-500">ID: {agentState.id}</span>
              {vapiSyncedAt && (
                <>
                  <span className="hidden md:inline-block text-zinc-300">•</span>
                  <span className="text-zinc-500">Last synced: {formatDate(vapiSyncedAt)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/settings/agents/${agentState.id}/advanced`}
              title="System prompt, tools, and power-user controls"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              Advanced →
            </Link>

            <button
              onClick={handleCancel}
              disabled={!isDirty || isPending}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              disabled={!isDirty || isPending || workspaceStatus === "paused"}
              title={workspaceStatus === "paused" ? "Workspace is paused" : undefined}
              className="rounded-xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Section marker */}
      <div className="mt-6 flex items-center justify-between gap-2">
        <span className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Agent defaults</span>

        <span className="text-sm text-zinc-500">
          Power controls live in <span className="font-semibold text-zinc-700">Advanced</span>.
        </span>
      </div>

      {/* Main */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Defaults */}
        <section className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <Header title="Defaults" desc="These settings shape how the agent sounds and behaves in most calls." />

          <div className="mt-6 grid grid-cols-1 gap-6">
            {/* Language chips */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-zinc-900">Language</p>
                <span className="text-xs text-zinc-500">Simple selection. Dialects in Advanced.</span>
              </div>

              <LanguageChips value={language} onChange={setLanguage} />

              <p className="text-xs text-zinc-500">Default for this agent.</p>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">Timezone</p>
              <input
                type="text"
                list="timezone-list"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
              />
              <datalist id="timezone-list">
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              <p className="text-xs text-zinc-500">Timezone context for date/time references.</p>
            </div>

            {/* Agent type */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">Agent type</p>
              <select
                value={agentType}
                onChange={(e) => setAgentType(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
              >
                <option value="">Select type...</option>
                {AGENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">Classification for organization and filtering.</p>
            </div>

            {/* Behavior preset cards */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">Behavior preset</p>

              <PresetCards value={behaviorPreset} onChange={setBehaviorPreset} options={PRESETS} />

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-semibold text-zinc-900">{selectedPreset.short}</p>
                <p className="mt-1 text-sm text-zinc-600">{selectedPreset.desc}</p>
              </div>

              <p className="text-xs text-zinc-500">
                Presets map to curated prompt blocks. Advanced allows full override.
              </p>
            </div>

            {/* Emphasis points */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">Emphasis points</p>
              <div className="space-y-2">
                {emphasisPoints.map((point, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={point}
                      onChange={(e) => {
                        const updated = [...emphasisPoints];
                        updated[idx] = e.target.value;
                        setEmphasisPoints(updated);
                      }}
                      className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => removeEmphasisPoint(idx)}
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newEmphasisPoint}
                    onChange={(e) => setNewEmphasisPoint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addEmphasisPoint();
                      }
                    }}
                    placeholder="Add emphasis point..."
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={addEmphasisPoint}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
                  >
                    Add
                  </button>
                </div>
              </div>
              <p className="text-xs text-zinc-500">Key points to emphasize in conversations.</p>
            </div>

            {/* First message */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">First message</p>
              <textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
                placeholder="Hello, thanks for calling…"
              />
              <p className="text-xs text-zinc-500">
                Used at the start of calls. Workspace company name can be injected automatically.
              </p>
            </div>
          </div>
        </section>

        {/* Side panel */}
        <section className="space-y-6">
          {/* Summary */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <Header title="Summary" desc="At-a-glance details for this agent." />

            <div className="mt-6 space-y-4">
              <ReadOnlyRow label="Status" value={pill.label} badge />
              <ReadOnlyRow label="Language" value={language} />
              <ReadOnlyRow label="Timezone" value={timezone || "UTC"} />
              <ReadOnlyRow label="Preset" value={selectedPreset.short} />
              {agentType && <ReadOnlyRow label="Type" value={agentType} />}
            </div>
          </div>

          {/* Sync status */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <Header title="Vapi sync" desc="Last synchronization status with Vapi." />

            <div className="mt-6 space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                <span className="text-sm font-medium text-zinc-700">Status</span>
                <span className={`text-sm font-semibold ${formatSyncStatus(vapiSyncStatus).className}`}>
                  {formatSyncStatus(vapiSyncStatus).label}
                </span>
              </div>
              {vapiSyncedAt && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-700">Last synced</span>
                  <span className="text-sm font-semibold text-zinc-900">{formatDate(vapiSyncedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Effective prompt preview */}
          {effectivePrompt && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <Header title="Effective prompt preview" desc="Read-only preview of the derived system prompt." />

              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <pre className="whitespace-pre-wrap text-xs text-zinc-700 font-mono">
                  {effectivePrompt}
                </pre>
              </div>
            </div>
          )}

          {/* Advanced link */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm font-semibold text-zinc-900">System prompt & power controls</p>
            <p className="mt-1 text-sm text-zinc-600">
              Edit system prompt, tools, and advanced overrides when you need full control.
            </p>

            <div className="mt-4">
              <Link
                href={`/dashboard/settings/agents/${agentState.id}/advanced`}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
              >
                Review →
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/* ----------------------------- Language chips ----------------------------- */

function LanguageChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [openMore, setOpenMore] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!openMore) return;
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) setOpenMore(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (!openMore) return;
      if (e.key === "Escape") setOpenMore(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openMore]);

  const selected = LANGUAGE_CHIPS.find((l) => l.name === value);

  return (
    <div className="relative" ref={ref}>
      <div className="flex flex-wrap items-center gap-2">
        {LANGUAGE_CHIPS.map((l) => {
          const active = l.name === value;
          return (
            <button
              key={l.code}
              type="button"
              title={l.title}
              onClick={() => onChange(l.name)}
              className={[
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
              ].join(" ")}
            >
              <LangBadge active={active} />
              <span className="tracking-wide">{l.code}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOpenMore((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
          title="More languages"
        >
          More <ChevronDown />
        </button>
      </div>

      {openMore ? (
        <div className="absolute z-20 mt-2 w-[320px] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg">
          <div className="border-b border-zinc-200 px-4 py-3">
            <p className="text-sm font-semibold text-zinc-900">All languages</p>
            <p className="mt-1 text-xs text-zinc-500">MVP list (expand later)</p>
          </div>
          <div className="max-h-64 overflow-auto py-1">
            {ALL_LANGUAGES.map((lang) => {
              const active = lang === value;
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    onChange(lang);
                    setOpenMore(false);
                  }}
                  className={[
                    "flex w-full items-center justify-between px-4 py-3 text-left text-base transition hover:bg-zinc-50",
                    active ? "bg-zinc-50 font-semibold text-zinc-900" : "text-zinc-900",
                  ].join(" ")}
                >
                  <span>{lang}</span>
                  {active ? <CheckIcon /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- Preset cards ----------------------------- */

function PresetCards({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PresetOption[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {options.map((p) => {
        const active = p.label === value;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.label)}
            className={[
              "rounded-2xl border p-4 text-left shadow-sm transition",
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{p.short}</p>
                <p className={active ? "mt-1 text-sm text-white/80" : "mt-1 text-sm text-zinc-600"}>{p.desc}</p>
              </div>
              {active ? (
                <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold">
                  Selected
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------- UI bits ----------------------------- */

function Header({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <p className="text-base font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-600">{desc}</p>
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      {badge ? (
        <span className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
          {value}
        </span>
      ) : (
        <span className="text-sm font-semibold text-zinc-900">{value}</span>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LangBadge({ active }: { active?: boolean }) {
  return (
    <span
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-lg border shadow-sm",
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-zinc-200 bg-zinc-50 text-zinc-700",
      ].join(" ")}
      aria-hidden="true"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M7 10.25C7 8.45 8.46 7 10.25 7h5.5C17.54 7 19 8.45 19 10.25v2.5C19 14.54 17.54 16 15.75 16H12.2l-2.65 1.7c-.47.3-1.05-.04-1.05-.6V16.8C7.55 16.35 7 15.52 7 14.5v-4.25Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path d="M10 10.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
        <path d="M10 12.75h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.95" />
      </svg>
    </span>
  );
}

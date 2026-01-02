"use client";

import * as React from "react";
import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

const DEFAULT_PROMPT = `
You are a voice-based AI agent representing the company.
Speak naturally, clearly, and professionally.
If unsure, ask a clarifying question instead of guessing.
Never mention internal systems, AI models, or technical details.
`.trim();

export default function AgentAdvancedPage({
  params,
}: {
  params: { agentId: string };
}) {
  const agentName = params.agentId;

  const [customPrompt, setCustomPrompt] = React.useState<string>("");

  const effective = (customPrompt || DEFAULT_PROMPT).trim();

  return (
    <SettingsShell
      title={`Advanced: ${agentName}`}
      subtitle="Power-user overrides for this agent."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Agents", href: "/dashboard/settings/agents" },
        { label: agentName, href: `/dashboard/settings/agents/${agentName}` },
        { label: "Advanced" },
      ]}
    >
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Link
          href={`/dashboard/settings/agents/${agentName}`}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          Agent defaults
        </Link>

        <span className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
          Advanced
        </span>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
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
              onClick={() => setCustomPrompt("")}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50"
            >
              Clear override
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900">Effective prompt (read-only)</p>
          <textarea
            readOnly
            value={effective}
            rows={8}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-mono leading-6 text-zinc-700"
          />
        </div>
      </div>
    </SettingsShell>
  );
}

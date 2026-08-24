"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, Bot, ShieldOff } from "lucide-react";
import type { HandlingMode } from "@/lib/platform/handling";
import {
  setConversationHandlingAction,
  setConversationOptOutAction,
} from "../../inbox/_actions";

/**
 * Human takeover control (Phase 3) — the context rail's action block.
 *
 * Honest by construction: Denku does not reply on any channel today, so this states who *owns*
 * the conversation rather than implying it is intercepting an automated reply that does not
 * exist. The state is real now (it drives the Inbox filter and the Home alert) and becomes the
 * gate on automated replies when those ship.
 */
export default function HandlingControl({
  conversationRef,
  source,
  channel,
  handling,
  automationOptedOut,
  available,
}: {
  conversationRef: string;
  source: string;
  channel: string;
  handling: HandlingMode;
  automationOptedOut: boolean;
  /** False when the handling migration is not applied — controls render disabled, not broken. */
  available: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || "That didn't save. Please try again.");
      else router.refresh();
    });
  };

  const isHuman = handling === "human";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Handling</p>

      <div className="mb-3 flex items-center gap-2">
        {isHuman ? (
          <>
            <UserCheck className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-navy-700 dark:text-white">A person owns this</span>
          </>
        ) : (
          <>
            <Bot className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-medium text-navy-700 dark:text-white">Handled by your AI</span>
          </>
        )}
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
      ) : null}

      {!available ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Takeover isn&apos;t available on this environment yet — the handling migration hasn&apos;t
          been applied. The conversation itself is unaffected.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!available || isPending}
          onClick={() =>
            run(() => setConversationHandlingAction(conversationRef, source, channel, isHuman ? "ai" : "human"))
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-navy-900 dark:text-gray-100 dark:hover:bg-white/5"
        >
          {isHuman ? <Bot className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          {isHuman ? "Hand back to AI" : "I'll take this over"}
        </button>

        <button
          type="button"
          disabled={!available || isPending}
          onClick={() =>
            run(() => setConversationOptOutAction(conversationRef, source, channel, !automationOptedOut))
          }
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-navy-900 dark:text-gray-100 dark:hover:bg-white/5"
        >
          <ShieldOff className="h-4 w-4" />
          {automationOptedOut ? "Allow automated handling" : "Opt this customer out"}
        </button>
      </div>

      {automationOptedOut ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          This customer has opted out of automated handling. Their messages are still stored and
          shown to your team — they are simply never processed automatically.
        </p>
      ) : null}
    </div>
  );
}

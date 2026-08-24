"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LIFECYCLE_STAGES, LIFECYCLE, lifecycleMeta } from "@/lib/platform/lifecycle";
import { setContactLifecycleAction } from "../../crm/_actions";

/**
 * Lifecycle control (Phase 4). Writes `leads.status` — the column that already IS the lifecycle —
 * so there is one source of truth and existing leads carry their stage in immediately.
 *
 * A legacy value outside the current vocabulary is shown as-is rather than coerced, so nobody's
 * data is silently relabelled by opening the page.
 */
export default function LifecycleControl({
  contactRef,
  status,
}: {
  contactRef: string;
  status: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = lifecycleMeta(status);
  const isLegacy = Boolean(current && !(LIFECYCLE_STAGES as readonly string[]).includes(current.value));

  const change = (stage: string) => {
    setError(null);
    startTransition(async () => {
      const res = await setContactLifecycleAction(contactRef, stage);
      if (!res.ok) setError(res.error || "That didn't save.");
      else router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Lifecycle</p>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {LIFECYCLE_STAGES.map((stage) => {
          const active = current?.value === stage;
          return (
            <button
              key={stage}
              type="button"
              disabled={isPending || active}
              onClick={() => change(stage)}
              title={LIFECYCLE[stage].description}
              aria-pressed={active}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed ${
                active
                  ? "bg-brand-500 text-white"
                  : "border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              }`}
            >
              {LIFECYCLE[stage].label}
            </button>
          );
        })}
      </div>

      {current ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{current.description}</p>
      ) : (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          No stage recorded yet. Pick one to start tracking this relationship.
        </p>
      )}

      {isLegacy && current ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          Currently “{current.label}”, recorded before these stages existed. Choosing one above
          replaces it.
        </p>
      ) : null}
    </div>
  );
}

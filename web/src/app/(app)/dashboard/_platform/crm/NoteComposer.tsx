"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NOTE_MAX_LENGTH } from "@/lib/platform/noteRules";
import { addContactNoteAction } from "../../crm/_actions";

/**
 * Note composer (Phase 4) — adds a timestamped, authored entry to the contact timeline.
 *
 * Notes are what turn the CRM from a log of what the AI did into shared memory a team
 * contributes to. Kept deliberately plain: one field, one action, no rich text.
 */
export default function NoteComposer({
  contactRef,
  available,
}: {
  contactRef: string;
  /** False when the notes migration is not applied — the field is disabled, not hidden. */
  available: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await addContactNoteAction(contactRef, body);
      if (!res.ok) {
        setError(res.error || "That didn't save. Please try again.");
        return;
      }
      setBody("");
      router.refresh();
    });
  };

  return (
    <div>
      {!available ? (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Notes aren&apos;t available on this environment yet — the notes migration hasn&apos;t been
          applied. The rest of the timeline is unaffected.
        </p>
      ) : null}

      {error ? (
        <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={!available || isPending}
        rows={2}
        maxLength={NOTE_MAX_LENGTH}
        placeholder="Add what you know about this customer…"
        aria-label="Add a note"
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-navy-900 dark:text-white"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">
          {body.trim().length > 0 ? `${body.trim().length}/${NOTE_MAX_LENGTH}` : "Visible to your team"}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!available || isPending || body.trim().length === 0}
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Add note"}
        </button>
      </div>
    </div>
  );
}

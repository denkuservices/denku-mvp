"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setContactNameAction } from "../../crm/_actions";

/**
 * Correct a contact's name (2026-08-27).
 *
 * Every Inbox row said "Unknown contact" even when the caller had introduced themselves, and when
 * a name did come through, speech-to-text had sometimes misheard it. Making the caller spell it
 * out on the phone would fix a minority of calls by taxing all of them; the owner has the
 * recording open and can fix it in a second.
 *
 * Deliberately plain: a text field and a Save. The name is one string, and this is a correction,
 * not data entry.
 */
export default function NameControl({
  contactRef,
  name,
  handle,
}: {
  contactRef: string;
  name: string | null;
  handle: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A refresh (or another tab) can change the stored name under us.
  useEffect(() => {
    setValue(name ?? "");
  }, [name]);

  const dirty = value.trim() !== (name ?? "").trim();

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setContactNameAction(contactRef, value);
      if (!res.ok) {
        setError(res.error || "That didn't save.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Name</p>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !isPending) save();
          }}
          disabled={isPending}
          placeholder={handle || "Unknown contact"}
          aria-label="Contact name"
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-navy-700 outline-none transition placeholder:text-gray-400 focus:border-brand-500 disabled:opacity-50 dark:border-white/10 dark:bg-navy-900 dark:text-white"
        />
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {saved && !dirty
          ? "Saved. Your AI won't overwrite this."
          : name
            ? "Heard on a call — correct it if the spelling is wrong. Your AI won't overwrite it."
            : "Your AI fills this in when a caller gives their name, and never changes it once you have."}
      </p>
    </div>
  );
}

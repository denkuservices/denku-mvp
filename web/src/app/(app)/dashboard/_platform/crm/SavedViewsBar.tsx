"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Check, Loader2, Users, X } from "lucide-react";
import type { SavedView } from "@/lib/platform/savedViews";
import {
  createSavedView,
  deleteSavedView,
  setSavedViewShared,
} from "./_actions/savedViews";

/**
 * The saved views on a list, and the control that adds one.
 *
 * Views are the answer to a filter someone rebuilds every morning. The bar deliberately shows
 * what the CURRENT filters would be saved as, rather than offering an empty "new view" dialog:
 * you filter until the list is what you want, then name what you are already looking at.
 *
 * "Save this view" is hidden when nothing is filtered — a view of everything is the list itself,
 * and a picker entry that does nothing when clicked is worse than no entry.
 */
export default function SavedViewsBar({
  surface,
  views,
  currentQuery,
  activeViewId,
  basePath,
}: {
  surface: string;
  views: SavedView[];
  /** The page's own search params, without a leading `?`. */
  currentQuery: string;
  activeViewId: string | null;
  basePath: string;
}) {
  const router = useRouter();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasFilters = currentQuery.replace(/(^|&)view=[^&]*/g, "").replace(/^&/, "").length > 0;

  const href = (view: SavedView) =>
    `${basePath}?${view.query}${view.query ? "&" : ""}view=${view.id}`;

  const save = async () => {
    setBusy(true);
    setError(null);
    const result = await createSavedView({ surface, name, query: currentQuery, shared });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNaming(false);
    setName("");
    setShared(false);
    router.refresh();
  };

  const remove = async (id: string) => {
    setBusy(true);
    await deleteSavedView(id);
    setBusy(false);
    if (activeViewId === id) router.push(basePath);
    else router.refresh();
  };

  const toggleShared = async (view: SavedView) => {
    setBusy(true);
    await setSavedViewShared(view.id, !view.shared);
    setBusy(false);
    router.refresh();
  };

  if (views.length === 0 && !hasFilters) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {views.map((view) => {
        const active = view.id === activeViewId;
        return (
          <span
            key={view.id}
            className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
              active
                ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-400/10 dark:text-brand-200"
                : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-white/10 dark:text-gray-300"
            }`}
          >
            <Link href={href(view)} className="inline-flex items-center gap-1.5">
              <Bookmark className={`h-3.5 w-3.5 ${active ? "fill-current" : ""}`} />
              {view.name}
              {/* Shared is stated, not implied: someone renaming a view the team relies on should
                  be able to see that the team relies on it. */}
              {view.shared ? <Users className="h-3 w-3 opacity-60" /> : null}
            </Link>

            {view.mine ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleShared(view)}
                  disabled={busy}
                  title={view.shared ? "Make private" : "Share with the workspace"}
                  className="ml-0.5 rounded-full p-0.5 opacity-0 transition hover:bg-black/5 focus:opacity-100 group-hover:opacity-60 dark:hover:bg-white/10"
                >
                  <Users className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(view.id)}
                  disabled={busy}
                  title="Remove this view"
                  className="rounded-full p-0.5 opacity-0 transition hover:bg-black/5 focus:opacity-100 group-hover:opacity-60 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : null}
          </span>
        );
      })}

      {hasFilters && !naming ? (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-white/20 dark:text-gray-400"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Save this view
        </button>
      ) : null}

      {naming ? (
        <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-brand-500 bg-white px-2 py-1 dark:border-brand-400 dark:bg-navy-800">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) save();
              if (e.key === "Escape") setNaming(false);
            }}
            placeholder="Name this view"
            maxLength={60}
            className="w-40 bg-transparent px-2 text-sm text-navy-700 outline-none dark:text-white"
          />
          <label className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Share
          </label>
          <button
            type="button"
            onClick={save}
            disabled={busy || !name.trim()}
            className="rounded-full bg-brand-500 p-1 text-white disabled:opacity-50"
            title="Save"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setError(null);
            }}
            className="rounded-full p-1 text-gray-400 hover:bg-black/5 dark:hover:bg-white/10"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}

      {error ? <span className="text-xs text-red-600 dark:text-red-400">{error}</span> : null}
    </div>
  );
}

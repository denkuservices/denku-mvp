import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Saved views — a named filter someone uses, instead of one they rebuild every morning.
 *
 * A view stores the surface's own search params verbatim (`status=open&q=boiler`). Modelling
 * filters as structured columns would put a second definition of "what a filter means" next to
 * the page's, and the two would drift the first time a list gained a control. Storing what the
 * page itself reads keeps exactly one definition, and a param a page later stops supporting is
 * ignored by the page rather than becoming a broken view.
 */

export const SAVED_VIEW_SURFACES = ["requests", "contacts", "appointments", "calls"] as const;
export type SavedViewSurface = (typeof SAVED_VIEW_SURFACES)[number];

export const SAVED_VIEW_NAME_MAX = 60;
/** A ceiling, not a guess: long enough for every filter a list has, short enough to refuse abuse. */
export const SAVED_VIEW_QUERY_MAX = 500;
/** Per surface, per person. Enough to be useful; few enough that the bar stays scannable. */
export const SAVED_VIEWS_PER_SURFACE = 20;

export interface SavedView {
  id: string;
  surface: SavedViewSurface;
  name: string;
  query: string;
  shared: boolean;
  createdBy: string | null;
  /** True when the viewer made it — only then may they rename, share or remove it. */
  mine: boolean;
}

export function isSavedViewSurface(value: unknown): value is SavedViewSurface {
  return typeof value === "string" && (SAVED_VIEW_SURFACES as readonly string[]).includes(value);
}

/**
 * Normalise a query string before it is stored or compared.
 *
 * Sorted keys and no leading `?`, so the same filter reached by clicking in two different orders
 * is recognisably one view. Paging and the saved-view selection itself are dropped: a view is a
 * filter, not a scroll position, and one that stored `view=` would re-select itself forever.
 */
export function normalizeViewQuery(raw: string): string {
  const params = new URLSearchParams((raw ?? "").replace(/^\?/, ""));
  const out = new URLSearchParams();

  const ignored = new Set(["view", "page", "cursor", "offset"]);
  const keys = [...new Set([...params.keys()])].filter((k) => !ignored.has(k)).sort();

  for (const key of keys) {
    const value = (params.get(key) ?? "").trim();
    // An empty value is the absence of a filter; storing it makes two identical views compare
    // as different.
    if (value) out.set(key, value);
  }

  return out.toString().slice(0, SAVED_VIEW_QUERY_MAX);
}

/** Trimmed, capped, refused when empty — an unnamed view cannot be picked out of a list. */
export function normalizeViewName(raw: string): string | null {
  const name = (raw ?? "").trim().replace(/\s+/g, " ").slice(0, SAVED_VIEW_NAME_MAX);
  return name || null;
}

interface Row {
  id: string;
  surface: string;
  name: string;
  query: string;
  shared: boolean;
  created_by: string | null;
}

/**
 * The views this person can see on this surface: their own, plus whatever the workspace shares.
 *
 * Never throws — a list that cannot load its saved views should still list its records, and this
 * returns an empty array before the migration has been applied.
 */
export async function listSavedViews(
  orgId: string,
  surface: SavedViewSurface,
  profileId: string | null
): Promise<SavedView[]> {
  if (!orgId) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from("saved_views")
      .select("id, surface, name, query, shared, created_by")
      .eq("org_id", orgId)
      .eq("surface", surface)
      .order("position", { ascending: true })
      .order("name", { ascending: true });

    if (error || !data) return [];

    return (data as Row[])
      // The private/shared rule is enforced here rather than in a policy: every read on this
      // table goes through the service-role client, so there is no policy to lean on.
      .filter((row) => row.shared || (profileId != null && row.created_by === profileId))
      .map((row) => ({
        id: row.id,
        surface: row.surface as SavedViewSurface,
        name: row.name,
        query: row.query,
        shared: row.shared,
        createdBy: row.created_by,
        mine: profileId != null && row.created_by === profileId,
      }));
  } catch {
    return [];
  }
}

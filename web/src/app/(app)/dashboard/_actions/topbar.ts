"use server";

import { resolveViewer } from "@/lib/platform/serverOrg";
import { searchWorkspace } from "@/lib/platform/readModel/search";
import { loadAttentionFeed } from "@/lib/platform/readModel/attention";
import {
  EMPTY_SEARCH_RESULTS,
  SEARCH_MIN_LENGTH,
  type SearchResults,
} from "@/lib/platform/readModel/searchTypes";
import {
  EMPTY_ATTENTION_FEED,
  type AttentionFeed,
} from "@/lib/platform/readModel/attentionTypes";

/**
 * The topbar's two data calls (workspace search, notification feed).
 *
 * They are server actions rather than route handlers because the capsule is a client component
 * living in a LAYOUT: it has no `searchParams` to read and no page to be re-rendered by, so it
 * fetches on demand. Both resolve the viewer themselves — the caller passes no org id, because a
 * client component is not a place an org id may be trusted from.
 *
 * Both are read-only and both fail soft: an unresolved viewer gets an empty result, never an
 * error dialog on top of every dashboard page.
 */

export async function searchWorkspaceAction(rawQuery: string): Promise<SearchResults> {
  const query = (rawQuery ?? "").trim();
  if (query.length < SEARCH_MIN_LENGTH) return EMPTY_SEARCH_RESULTS(query);

  const { orgId, userId } = await resolveViewer();
  if (!orgId) return EMPTY_SEARCH_RESULTS(query);

  return searchWorkspace(orgId, userId ?? "", query);
}

export async function loadAttentionAction(): Promise<AttentionFeed> {
  const { orgId, userId } = await resolveViewer();
  if (!orgId) return EMPTY_ATTENTION_FEED;

  return loadAttentionFeed(orgId, userId ?? "");
}

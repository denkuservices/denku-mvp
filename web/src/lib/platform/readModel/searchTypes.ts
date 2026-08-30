import type { Channel } from "@/lib/platform/channels";

/**
 * Workspace-search types and limits, split out from `search.ts` so the **topbar** can import
 * them.
 *
 * `search.ts` is `server-only` and pulls in the service-role client; a client component that
 * imports one *value* from it (a constant, not a type) drags that whole graph into the browser
 * bundle and the build refuses it. Types erase, constants do not — so the constants live here,
 * in a module with no server imports, and `search.ts` re-exports them for server callers.
 */

export type SearchHitKind = "conversation" | "contact" | "request";

export interface SearchHit {
  kind: SearchHitKind;
  id: string;
  /** What the person recognises — a name, a subject. Never empty. */
  title: string;
  /** One line of context under the title (a summary, a phone number, a status). */
  subtitle: string | null;
  /** A short tag on the right — the channel, the request type. */
  meta: string | null;
  href: string;
  /** Set for conversation hits; drives nothing yet, kept so the panel can badge by channel. */
  channel?: Channel;
}

export interface SearchResults {
  query: string;
  conversations: SearchHit[];
  contacts: SearchHit[];
  requests: SearchHit[];
  total: number;
}

/** Below this, a search matches everything and means nothing — so it is not run. */
export const SEARCH_MIN_LENGTH = 2;
/** Rows shown per group. The panel is a shortcut, not a results page. */
export const SEARCH_GROUP_SIZE = 5;

export const EMPTY_SEARCH_RESULTS = (query = ""): SearchResults => ({
  query,
  conversations: [],
  contacts: [],
  requests: [],
  total: 0,
});

/**
 * Notification-feed types, split out from `attention.ts` for the same reason as `searchTypes.ts`:
 * the bell is a client component, and `attention.ts` is `server-only`. Types erase at compile
 * time, so importing them from the server module would have been harmless — but the empty-feed
 * constant is a value, and keeping the whole contract in one client-safe module means the next
 * person adding a constant does not have to rediscover why the build broke.
 */

export type AttentionKind =
  | "workspace_paused"
  | "usage"
  | "needs_person"
  | "unread"
  /** A ticket or appointment your AI produced that nobody has dealt with yet. */
  | "new_request";
export type AttentionSeverity = "critical" | "warning" | "info";

export interface AttentionItem {
  /** Stable within one feed — used as the React key, not persisted anywhere. */
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  body: string | null;
  href: string;
  /** When it last happened, for the ones that have a time. ISO string. */
  at: string | null;
}

export interface AttentionFeed {
  items: AttentionItem[];
  /** Badge number. Equal to `items.length` — the badge must never disagree with the list. */
  count: number;
}

export const EMPTY_ATTENTION_FEED: AttentionFeed = { items: [], count: 0 };

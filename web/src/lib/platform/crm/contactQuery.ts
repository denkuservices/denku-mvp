/**
 * URL-safe contact list controls shared by the Server Component and its client toolbar.
 *
 * Keep this module free of read-model and server-only imports: the toolbar needs these labels and
 * URL helpers in the browser, while contact data and insight evaluation remain server-side.
 */

export const SEGMENTS = [
  {
    value: "",
    label: "All",
    hint: "Everyone your AI team has spoken to.",
  },
  {
    value: "attention",
    label: "Needs attention",
    hint: "Has at least one request still open.",
  },
  {
    value: "upcoming",
    label: "Upcoming",
    hint: "Has an appointment still to come.",
  },
  {
    value: "new",
    label: "New",
    hint: "Heard from, not yet followed up.",
  },
  {
    value: "qualified",
    label: "Qualified",
    hint: "Worth your team's time.",
  },
  {
    value: "quiet",
    label: "Gone quiet",
    hint: "Nothing from them in 30 days, and nothing open.",
  },
] as const;

export type SegmentValue = (typeof SEGMENTS)[number]["value"];

export function isSegment(value: string): value is SegmentValue {
  return SEGMENTS.some((segment) => segment.value === value);
}

export const SORTS = [
  { value: "recent", label: "Recent activity" },
  { value: "attention", label: "Most open requests" },
  { value: "upcoming", label: "Soonest appointment" },
  { value: "calls", label: "Most calls" },
  { value: "name", label: "Name (A–Z)" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];

export function isSort(value: string): value is SortValue {
  return SORTS.some((sort) => sort.value === value);
}

export interface ContactsQuery {
  q: string;
  segment: string;
  sort: string;
  page: number;
}

export const CONTACTS_PAGE_SIZE = 25;

export function parseContactsQuery(params: Record<string, string | undefined>): ContactsQuery {
  const segment = (params.segment ?? "").trim();
  const sort = (params.sort ?? "").trim();
  const page = Number.parseInt(params.page ?? "1", 10);
  return {
    q: (params.q ?? "").trim().slice(0, 120),
    segment: isSegment(segment) ? segment : "",
    sort: isSort(sort) ? sort : "recent",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Build a querystring that preserves everything except what the caller overrides. */
export function contactsHref(current: ContactsQuery, patch: Partial<ContactsQuery>): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.segment) params.set("segment", next.segment);
  if (next.sort && next.sort !== "recent") params.set("sort", next.sort);
  // A page reset is the right default for every filter change, so `page` is only kept when the
  // caller explicitly asks for one.
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return `/dashboard/crm/contacts${qs ? `?${qs}` : ""}`;
}

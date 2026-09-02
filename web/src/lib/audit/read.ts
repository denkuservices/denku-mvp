import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AuditChange, AuditEntry, AuditFilters } from "./shared";

// Re-exported so server callers keep one import for the whole module. The definitions live in
// `shared.ts` because the filter bar is a client component and this file is `server-only`.
export * from "./shared";

/**
 * Reading the audit log.
 *
 * The page used to select the latest 20 rows and hand them to a component whose only affordance
 * was "show 15 more" — so an audit trail became un-auditable the moment the workspace was busy for
 * a day. Filtering, searching and paging are done in Postgres here, not in the browser over a
 * 20-row window, because the point of an audit log is answering "what happened to billing last
 * March", and no client-side filter can answer that over rows it never fetched.
 *
 * Reads use the SERVICE-ROLE client with an explicit `.eq("org_id", …)`. The org comes from the
 * capability-checked viewer, never from a query parameter.
 */

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export const AUDIT_PAGE_SIZE = 25;

/**
 * An export is a convenience, not a data dump: capped so a busy workspace gets a bounded file and
 * an honest note rather than a serverless function that dies at its timeout.
 */
export const AUDIT_EXPORT_LIMIT = 5000;

export type ActorRow = { id: string; email: string | null; full_name: string | null };

export async function listAuditActors(orgId: string): Promise<ActorRow[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("org_id", orgId)
    .order("full_name", { ascending: true });
  return (data ?? []) as ActorRow[];
}

const SELECT_COLUMNS = "id, action, entity_type, entity_id, created_at, actor_user_id";

type RawRow = Omit<AuditEntry, "actor_email" | "actor_name" | "changes">;

export async function readAuditPage(
  orgId: string,
  filters: AuditFilters,
  page: number,
  pageSize: number = AUDIT_PAGE_SIZE
): Promise<AuditPage> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * pageSize;

  const term = searchTerm(filters.q);
  const actorIds = term ? await actorIdsMatching(orgId, term) : [];

  const { data, error, count } = await applyFilters(
    supabaseAdmin.from("audit_log").select(SELECT_COLUMNS, { count: "exact" }).eq("org_id", orgId),
    filters,
    actorIds
  )
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("[SETTINGS][AUDIT][LOAD_FAILED]", error.message);
    throw new Error("audit_read_failed");
  }

  const rows = (data ?? []) as unknown as RawRow[];
  const total = count ?? rows.length;

  return {
    entries: await hydrate(rows),
    total,
    page: safePage,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function readAuditForExport(orgId: string, filters: AuditFilters): Promise<AuditEntry[]> {
  const term = searchTerm(filters.q);
  const actorIds = term ? await actorIdsMatching(orgId, term) : [];

  const { data, error } = await applyFilters(
    supabaseAdmin.from("audit_log").select(SELECT_COLUMNS).eq("org_id", orgId),
    filters,
    actorIds
  )
    .order("created_at", { ascending: false })
    .limit(AUDIT_EXPORT_LIMIT);

  if (error) {
    console.error("[SETTINGS][AUDIT][EXPORT_FAILED]", error.message);
    throw new Error("audit_read_failed");
  }

  return hydrate((data ?? []) as unknown as RawRow[]);
}

/* ------------------------------------------------------------------ internals */

/**
 * The shape of a PostgREST query builder, structurally.
 *
 * This was `any`, and `any` cost a production outage: `applyFilters` used to be `async` and
 * `return q`, where `q` is a query BUILDER. A builder is a thenable, so the async machinery awaited
 * it — which EXECUTES the query — and the caller received a response object instead of a builder.
 * The next `.order(...)` was `undefined`, the page threw, and every audit log read failed with
 * "We couldn't load the audit log".
 *
 * Typed structurally and returned synchronously, the compiler now rejects that mistake: a
 * `Promise<T>` cannot be chained with `.order()`.
 */
interface AuditQuery {
  like(column: string, pattern: string): AuditQuery;
  eq(column: string, value: string): AuditQuery;
  gte(column: string, value: string): AuditQuery;
  lte(column: string, value: string): AuditQuery;
  or(filters: string): AuditQuery;
}

/**
 * Ids of members whose name or email matches the search term.
 *
 * Searching for a person means searching a different table, so their ids are resolved first and
 * folded into the audit query's `or` — otherwise typing a colleague's name into the search box
 * would silently match nothing. Separated from `applyFilters` so that function can stay
 * synchronous; see the note above for why that matters.
 */
async function actorIdsMatching(orgId: string, term: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("org_id", orgId)
    .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
    .limit(50);

  return (data ?? []).map((a) => (a as { id: string }).id);
}

/**
 * PostgREST's `or` is a comma-separated string, so a term containing a comma, a paren or a percent
 * would change the meaning of the filter rather than be searched for. Strip them.
 */
function searchTerm(raw: string | undefined): string {
  return (raw ?? "").replace(/[%,().*]/g, " ").trim();
}

/**
 * Generic in the builder so the RETURN TYPE is the builder itself — that is the part carrying the
 * safety. The narrowing casts are internal: constraining `T` structurally instead sends the
 * compiler into an infinite instantiation on PostgREST's own recursive generics.
 */
function applyFilters<T>(query: T, filters: AuditFilters, actorIds: string[]): T {
  let q = query as unknown as AuditQuery;

  if (filters.category) q = q.like("action", `${filters.category}.%`);
  if (filters.actorId) q = q.eq("actor_user_id", filters.actorId);
  if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00.000Z`);
  // Inclusive of the chosen day: the reader picked a date, not an instant.
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59.999Z`);

  const term = searchTerm(filters.q);
  if (term) {
    const clauses = [`action.ilike.%${term}%`, `entity_type.ilike.%${term}%`];
    if (actorIds.length > 0) clauses.push(`actor_user_id.in.(${actorIds.join(",")})`);
    q = q.or(clauses.join(","));
  }

  return q as unknown as T;
}

async function hydrate(rows: RawRow[]): Promise<AuditEntry[]> {
  if (rows.length === 0) return [];

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => Boolean(id)))
  );

  const [actorsRes, changesRes] = await Promise.all([
    actorIds.length
      ? supabaseAdmin.from("profiles").select("id, email, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as ActorRow[] }),
    supabaseAdmin
      .from("audit_log_changes")
      .select("audit_log_id, field, before_value, after_value")
      .in(
        "audit_log_id",
        rows.map((r) => r.id)
      ),
  ]);

  const actorMap = new Map<string, ActorRow>();
  for (const a of (actorsRes.data ?? []) as ActorRow[]) actorMap.set(a.id, a);

  const changeMap = new Map<string, AuditChange[]>();
  for (const c of (changesRes.data ?? []) as Array<AuditChange & { audit_log_id: string }>) {
    const list = changeMap.get(c.audit_log_id) ?? [];
    list.push({ field: c.field, before_value: c.before_value, after_value: c.after_value });
    changeMap.set(c.audit_log_id, list);
  }

  return rows.map((r) => {
    const actor = r.actor_user_id ? actorMap.get(r.actor_user_id) : null;
    return {
      ...r,
      actor_email: actor?.email ?? null,
      actor_name: actor?.full_name ?? null,
      changes: changeMap.get(r.id) ?? [],
    };
  });
}

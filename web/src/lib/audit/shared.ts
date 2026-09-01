/**
 * The parts of the audit log that are pure.
 *
 * Split out of `read.ts` because that module is `server-only` (it holds the service-role client)
 * and the filter bar is a client component that needs the category list. Importing the reader from
 * the browser bundle is a build error, and rightly so — but a list of strings and a CSV formatter
 * have no business being server-only in the first place.
 */

export type AuditChange = { field: string; before_value: string | null; after_value: string | null };

export type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  changes: AuditChange[];
};

export type AuditFilters = {
  /** Free text over the action, the entity type and the actor's name or email. */
  q?: string;
  /** Coarse grouping matched as an action prefix — "billing", "member", "workspace"… */
  category?: string;
  actorId?: string;
  /** Calendar dates (YYYY-MM-DD), interpreted as whole UTC days. */
  from?: string;
  to?: string;
};

export type AuditPage = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * The categories offered in the filter, derived from the action VOCABULARY rather than a column:
 * actions are dotted strings (`billing.plan.change`, `member.role.change`) whose first segment is
 * already the grouping, so a new action lands in the right bucket without a migration.
 */
export const AUDIT_CATEGORIES = [
  { value: "billing", label: "Billing" },
  { value: "member", label: "Members" },
  { value: "workspace", label: "Workspace" },
  { value: "channel", label: "Channels" },
  { value: "security", label: "Security" },
] as const;

/** Parse the filters out of a URL's search params, ignoring anything malformed. */
export function parseAuditFilters(params: URLSearchParams | Record<string, string | undefined>): AuditFilters {
  const get = (k: string): string | undefined => {
    const v = params instanceof URLSearchParams ? params.get(k) : params[k];
    const s = (v ?? "").trim();
    return s.length > 0 ? s : undefined;
  };

  const isDate = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const category = get("category");

  return {
    q: get("q")?.slice(0, 120),
    category: AUDIT_CATEGORIES.some((c) => c.value === category) ? category : undefined,
    actorId: /^[0-9a-f-]{36}$/i.test(get("actor") ?? "") ? get("actor") : undefined,
    from: isDate(get("from")),
    to: isDate(get("to")),
  };
}

/** One CSV cell, quoted the way a spreadsheet expects. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The export: one row per field changed (and one per entry that changed nothing), so a filter in
 * the spreadsheet over "field = plan_code" works. A single row carrying a JSON blob would not
 * survive contact with the tool the finance person actually opens it in.
 */
export function auditToCsv(entries: AuditEntry[]): string {
  const header = [
    "timestamp_utc",
    "action",
    "entity_type",
    "entity_id",
    "actor_name",
    "actor_email",
    "field",
    "before",
    "after",
  ];

  const lines = [header.join(",")];

  for (const e of entries) {
    const base = [
      e.created_at,
      e.action,
      e.entity_type,
      e.entity_id ?? "",
      e.actor_name ?? "",
      e.actor_email ?? "",
    ];
    if (e.changes.length === 0) {
      lines.push([...base, "", "", ""].map(csvCell).join(","));
      continue;
    }
    for (const c of e.changes) {
      lines.push([...base, c.field, c.before_value ?? "", c.after_value ?? ""].map(csvCell).join(","));
    }
  }

  return lines.join("\r\n");
}

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/auth/permissions";
import {
  AUDIT_EXPORT_LIMIT,
  auditToCsv,
  parseAuditFilters,
  readAuditForExport,
} from "@/lib/audit/read";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * The audit log as a CSV, matching whatever is on screen.
 *
 * Two things make this more than a download button. First, it is capability-gated
 * (`view_audit_log`) — the audit trail names who did what and when, and that is not information a
 * `viewer` needs. Second, **exporting is itself audited**: taking a copy of the record of every
 * change is exactly the kind of event a record of every change should contain.
 *
 * The filters come from the same parser the page uses, so "export" means "export what I am looking
 * at" rather than "export everything and let me find it again".
 */
export async function GET(req: NextRequest) {
  const gate = await guard("view_audit_log");
  if (!gate.ok) return gate.response;
  const { orgId, profileId } = gate.viewer;

  const filters = parseAuditFilters(req.nextUrl.searchParams);

  let entries;
  try {
    entries = await readAuditForExport(orgId, filters);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not build the export" }, { status: 500 });
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: profileId,
    action: "security.audit.export",
    entity_type: "audit_log",
    entity_id: orgId,
    diff: { rows: { before: null, after: entries.length } },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const body = auditToCsv(entries);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="denku-audit-${stamp}.csv"`,
      // Says plainly whether the file is the whole answer or the first 5,000 rows of it.
      "X-Denku-Export-Truncated": entries.length >= AUDIT_EXPORT_LIMIT ? "true" : "false",
      "Cache-Control": "no-store",
    },
  });
}

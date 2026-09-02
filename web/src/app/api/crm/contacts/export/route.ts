import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/permissions";
import { listContactViews } from "@/lib/platform/readModel/contacts";
import { loadContactInsights } from "@/lib/platform/readModel/contactInsights";
import {
  contactsToCsv,
  matchesSearch,
  matchesSegment,
  parseContactsQuery,
  sortRows,
  withInsights,
} from "@/lib/platform/crm/contactRows";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 500;

/**
 * The customer list as a spreadsheet.
 *
 * A CRM that will not hand a business its own customer list back is holding it hostage; this is
 * the cheapest possible way not to be that.
 *
 * It reads the SAME query parameters the page does and runs them through the same pure helpers,
 * so "Export" means "export what I am looking at" rather than "export everything and find it
 * again". Any member of the workspace may take it — contacts are the business's own record of
 * its customers, not privileged internal data like the audit trail — but the org always comes
 * from the session, never from a parameter.
 */
export async function GET(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer.userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!viewer.orgId) {
    return NextResponse.json({ ok: false, error: "No workspace found for this account" }, { status: 400 });
  }

  const params = req.nextUrl.searchParams;
  const query = parseContactsQuery({
    q: params.get("q") ?? undefined,
    segment: params.get("segment") ?? undefined,
    sort: params.get("sort") ?? undefined,
  });

  const contacts = await listContactViews(viewer.orgId, { limit: SCAN_LIMIT });
  const insights = await loadContactInsights(viewer.orgId, contacts.map((c) => c.id));

  const now = Date.now();
  const rows = sortRows(
    withInsights(contacts, insights)
      .filter((row) => matchesSearch(row, query.q))
      .filter((row) => matchesSegment(row, query.segment, now)),
    query.sort
  );

  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(contactsToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="denku-customers-${stamp}.csv"`,
      // Says plainly whether the file is the whole answer or the first 500 rows of it.
      "X-Denku-Export-Truncated": contacts.length >= SCAN_LIMIT ? "true" : "false",
      "Cache-Control": "no-store",
    },
  });
}

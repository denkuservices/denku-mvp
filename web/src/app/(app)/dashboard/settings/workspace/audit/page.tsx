import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, History, Lock } from "lucide-react";
import { getViewer, roleCan } from "@/lib/auth/permissions";
import { EmptyState } from "@/app/(app)/dashboard/_platform/ui";
import {
  Notice,
  Panel,
  SettingsHero,
  SettingsLinkButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { AUDIT_PAGE_SIZE, listAuditActors, parseAuditFilters, readAuditPage } from "@/lib/audit/read";
import { AuditLogList } from "./_components/AuditLogList";
import { AuditFilterBar } from "./_components/AuditFilterBar";
import { AuditPager } from "./_components/AuditPager";

export const dynamic = "force-dynamic";

/**
 * The audit log.
 *
 * Three things were wrong with it, and all three were about honesty rather than looks. It said it
 * covered "plan changes and member actions" while nothing on either path ever wrote a row. It was
 * readable by anyone signed in, including a `viewer`, though it names who did what and when. And
 * it showed the latest twenty entries with no way to reach the twenty-first, so the record existed
 * without being consultable.
 *
 * Now: capability-gated (`view_audit_log`), filtered and paged in Postgres, exportable as CSV, and
 * actually written to by billing, membership and workspace changes.
 */

function AuditHeader() {
  return (
    <SettingsHero
      icon={History}
      title="Audit log"
      subtitle="Every settings change, plan change and member action — with what it was before."
      action={
        <SettingsLinkButton href="/dashboard/settings/workspace" variant="secondary">
          <ArrowLeft />
          Back to Workspace
        </SettingsLinkButton>
      }
    />
  );
}

export default async function WorkspaceAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  if (!viewer.userId) redirect("/login");

  if (!viewer.orgId) {
    return (
      <div className="space-y-8">
        <AuditHeader />
        <Panel padded={false}>
          <EmptyState
            icon={Building2}
            title="No workspace"
            description="This account isn't part of a workspace yet, so there is nothing to audit."
          />
        </Panel>
      </div>
    );
  }

  // The audit trail names people and the decisions they took. A viewer reads the work; they do
  // not read the record of who changed what about the workspace.
  if (!roleCan(viewer.role, "view_audit_log")) {
    return (
      <div className="space-y-8">
        <AuditHeader />
        <Notice tone="info" icon={Lock} title="Owners and admins only">
          The audit log records who changed what in this workspace, so it is limited to owners and
          admins. Ask an owner if you need something from it.
        </Notice>
      </div>
    );
  }

  const raw = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v[0] : v;

  const filters = parseAuditFilters(flat);
  const page = Number.parseInt(flat.page ?? "1", 10);

  let result;
  try {
    result = await readAuditPage(viewer.orgId, filters, Number.isNaN(page) ? 1 : page, AUDIT_PAGE_SIZE);
  } catch {
    return (
      <div className="space-y-8">
        <AuditHeader />
        <Notice tone="critical" icon={AlertTriangle} title="We couldn't load the audit log">
          Reload the page — if this keeps happening, contact support.
        </Notice>
      </div>
    );
  }

  const actors = (await listAuditActors(viewer.orgId)).map((a) => ({
    id: a.id,
    label: a.full_name || a.email || "Unnamed member",
  }));

  return (
    <div className="space-y-6">
      <AuditHeader />
      <AuditFilterBar actors={actors} total={result.total} />
      <AuditLogList
        logs={result.entries}
        // A filtered view with no matches is a different message from a workspace with no history.
        filtered={Object.values(filters).some(Boolean)}
      />
      {result.pageCount > 1 ? (
        <Panel padded={false}>
          <AuditPager page={result.page} pageCount={result.pageCount} />
        </Panel>
      ) : null}
    </div>
  );
}

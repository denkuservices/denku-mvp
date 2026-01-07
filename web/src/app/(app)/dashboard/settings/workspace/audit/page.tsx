import { redirect } from "next/navigation";
import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AuditLogList } from "./_components/AuditLogList";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type AuditLogRow = {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

type AuditLogChangeRow = {
  audit_log_id: string;
  field: string;
  before_value: string | null;
  after_value: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
};

type AuditLogWithActor = AuditLogRow & {
  actor_email: string | null;
  actor_name: string | null;
};

type AuditLogWithChanges = AuditLogWithActor & {
  changes: Array<{ field: string; before_value: string | null; after_value: string | null }>;
};

export default async function WorkspaceAuditPage() {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2) Get profile with org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("id", user.id)
    .single<{ id: string; org_id: string | null }>();

  if (profErr || !profile) {
    return (
      <SettingsShell
        title="Audit log"
        subtitle="Track key actions across the workspace."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workspace" },
          { label: "Audit" },
        ]}
      >
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Error</p>
          <p className="mt-1 text-sm text-red-700">Failed to load profile.</p>
        </div>
      </SettingsShell>
    );
  }

  if (!profile.org_id) {
    return (
      <SettingsShell
        title="Audit log"
        subtitle="Track key actions across the workspace."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workspace" },
          { label: "Audit" },
        ]}
      >
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
          <p className="text-sm font-semibold text-zinc-900">No organization</p>
          <p className="mt-1 text-sm text-zinc-600">You are not part of an organization.</p>
        </div>
      </SettingsShell>
    );
  }

  const orgId = profile.org_id;

  // 3) Fetch audit_log records for this org (latest 20)
  const { data: auditLogs, error: auditErr } = await supabase
    .from("audit_log")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<AuditLogRow[]>();

  if (auditErr) {
    return (
      <SettingsShell
        title="Audit log"
        subtitle="Track key actions across the workspace."
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workspace" },
          { label: "Audit" },
        ]}
      >
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-900">Error</p>
          <p className="mt-1 text-sm text-red-700">Failed to load audit logs: {auditErr.message}</p>
        </div>
      </SettingsShell>
    );
  }

  const logs = auditLogs || [];

  // 4) Get unique actor_user_ids and fetch profiles (filter out nulls)
  const actorIds = Array.from(new Set(logs.map((log) => log.actor_user_id).filter((id): id is string => id !== null)));
  const { data: profiles } = actorIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", actorIds)
        .returns<ProfileRow[]>()
    : { data: [] };

  const profileMap = new Map<string, ProfileRow>();
  if (profiles) {
    for (const p of profiles) {
      profileMap.set(p.id, p);
    }
  }

  // 5) Fetch audit_log_changes for all audit_log_ids
  const auditLogIds = logs.map((log) => log.id);
  const { data: changes } = await supabase
    .from("audit_log_changes")
    .select("*")
    .in("audit_log_id", auditLogIds)
    .order("created_at", { ascending: true })
    .returns<AuditLogChangeRow[]>();

  const changesMap = new Map<string, AuditLogChangeRow[]>();
  if (changes) {
    for (const change of changes) {
      const existing = changesMap.get(change.audit_log_id) || [];
      existing.push(change);
      changesMap.set(change.audit_log_id, existing);
    }
  }

  // 6) Combine audit logs with actor info and changes
  const auditLogsWithChanges: AuditLogWithChanges[] = logs.map((log) => {
    const actorProfile = log.actor_user_id ? profileMap.get(log.actor_user_id) : null;
    const logChanges = changesMap.get(log.id) || [];

    return {
      ...log,
      actor_email: actorProfile?.email || null,
      actor_name: actorProfile?.full_name || null,
      changes: logChanges.map((c) => ({
        field: c.field,
        before_value: c.before_value,
        after_value: c.after_value,
      })),
    };
  });

  return (
    <SettingsShell
      title="Audit log"
      subtitle="Track key actions across the workspace."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Audit" },
      ]}
    >
      <Link href="/dashboard/settings/workspace/general">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <AuditLogList logs={auditLogsWithChanges} />
    </SettingsShell>
  );
}

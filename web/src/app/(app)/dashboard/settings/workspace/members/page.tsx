import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import { InviteMemberForm } from "./_components/InviteMemberForm";
import { listPendingInvites } from "@/lib/members/invites";

export default async function WorkspaceMembersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const orgId = await resolveOrgId();
  const canInvite = await isAdminOrOwner(orgId, auth.user.id);
  const pendingInvites = await listPendingInvites(orgId);

  // Fetch members (profiles in same org)
  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <SettingsShell
      title="Members"
      subtitle="Manage workspace access and roles."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workspace" },
        { label: "Members" },
      ]}
    >
      <Link href="/dashboard/settings/workspace/general">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>
      <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-6 shadow-sm space-y-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-navy-800">
              {members && members.length > 0 ? (
                members.map((member) => (
                  <tr key={member.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-navy-700 dark:text-white">
                      {member.full_name || member.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 capitalize">{member.role || "viewer"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                        Active
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-center text-gray-500">
                    No members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pendingInvites.length > 0 ? (
          <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5/60 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Pending invitations</p>
            <ul className="space-y-1.5">
              {pendingInvites.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-navy-700 dark:text-gray-100">{inv.email}</span>
                  <span className="shrink-0 text-xs text-gray-500 capitalize">{inv.role} · pending</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canInvite ? (
          <InviteMemberForm />
        ) : (
          <button
            disabled
            title="Only admins and owners can invite members"
            className="mt-5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-2 text-sm font-semibold text-navy-700 dark:text-white shadow-sm opacity-60 cursor-not-allowed"
          >
            Invite member
          </button>
        )}
      </div>
    </SettingsShell>
  );
}

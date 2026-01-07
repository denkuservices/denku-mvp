import Link from "next/link";
import { redirect } from "next/navigation";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import { InviteMemberForm } from "./_components/InviteMemberForm";

export default async function WorkspaceMembersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    redirect("/login");
  }

  const orgId = await resolveOrgId();
  const canInvite = await isAdminOrOwner(orgId, auth.user.id);

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
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {members && members.length > 0 ? (
                members.map((member) => (
                  <tr key={member.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {member.full_name || member.email || "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 capitalize">{member.role || "viewer"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">
                        Active
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-center text-zinc-500">
                    No members found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canInvite ? (
          <InviteMemberForm />
        ) : (
          <button
            disabled
            title="Only admins and owners can invite members"
            className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60 cursor-not-allowed"
          >
            Invite member
          </button>
        )}
      </div>
    </SettingsShell>
  );
}

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import { listPendingInvites } from "@/lib/members/invites";
import { InviteMemberForm } from "../members/_components/InviteMemberForm";

/**
 * Members — who can get into this workspace. Moved out of `workspace/members/page.tsx`, not
 * rewritten (Settings 9 → 4).
 *
 * It was a page reached from a quick-link on General, with its own back button, its own
 * breadcrumb and its own shell, to show a short table and an invite form. Both belong to the same
 * question a customer opens Workspace to answer.
 */
export default async function MembersSection() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const orgId = await resolveOrgId();
  const canInvite = await isAdminOrOwner(orgId, auth.user.id);
  const pendingInvites = await listPendingInvites(orgId);

  const { data: members } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 dark:bg-white/5 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Member</th>
              <th className="px-4 py-3 text-left font-semibold">Role</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-navy-800">
            {members && members.length > 0 ? (
              members.map((member) => (
                <tr key={member.id} className="border-t border-gray-100 dark:border-white/10">
                  <td className="px-4 py-3 font-medium text-navy-700 dark:text-white">
                    {member.full_name || member.email || "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-700 dark:text-gray-200">
                    {member.role || "viewer"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2} className="px-4 py-3 text-center text-gray-500">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingInvites.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Pending invitations
          </p>
          <ul className="space-y-1.5">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-navy-700 dark:text-gray-100">{inv.email}</span>
                <span className="shrink-0 text-xs capitalize text-gray-500">{inv.role} · pending</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canInvite ? (
        <InviteMemberForm />
      ) : (
        <p className="text-sm text-gray-500">Only admins and owners can invite members.</p>
      )}
    </div>
  );
}

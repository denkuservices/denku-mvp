import { Crown, Eye, Lock, MailCheck, ShieldCheck, UserPlus, Users } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId, isAdminOrOwner } from "@/lib/analytics/params";
import { listPendingInvites } from "@/lib/members/invites";
import Avatar from "@/app/(app)/dashboard/_platform/Avatar";
import { EmptyState } from "@/app/(app)/dashboard/_platform/ui";
import { StatusPill } from "@/app/(app)/dashboard/_platform/settings/ui";
import { InviteMemberForm } from "../members/_components/InviteMemberForm";

/**
 * Members — who can get into this workspace. Moved out of `workspace/members/page.tsx`, not
 * rewritten (Settings 9 → 4); re-shaped from a table into a roster in the visual pass.
 *
 * It was a two-column HTML table — "Member" and "Role" — which is the right structure for data and
 * the wrong one for people: every row opened with the same grey text at the same weight, so a
 * five-person workspace read as a spreadsheet of strings. Rows are now anchored by the same
 * `Avatar` used on Contacts and Conversations (initials on a colour derived from the row's own id,
 * so a person is the same colour everywhere), the email is shown under the name instead of being
 * swallowed by the fallback, and the role is a pill with the glyph of what that role can do.
 *
 * Pending invitations sit in the same list rather than in a footnote below it — an invited person
 * *is* someone who can reach this workspace, just not yet.
 */

const ROLE_STYLE: Record<string, { tone: "brand" | "info" | "neutral"; icon: typeof Crown }> = {
  owner: { tone: "brand", icon: Crown },
  admin: { tone: "info", icon: ShieldCheck },
  viewer: { tone: "neutral", icon: Eye },
};

function RolePill({ role }: { role: string | null }) {
  const key = (role || "viewer").toLowerCase();
  const style = ROLE_STYLE[key] ?? ROLE_STYLE.viewer;
  return (
    <StatusPill tone={style.tone} icon={style.icon}>
      <span className="capitalize">{key}</span>
    </StatusPill>
  );
}

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

  const roster = members ?? [];
  const seatCount = roster.length + pendingInvites.length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/10">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          <Users aria-hidden="true" className="h-4 w-4 text-gray-400" />
          {seatCount} {seatCount === 1 ? "person" : "people"}
          {pendingInvites.length > 0 ? (
            <span className="text-gray-400">· {pendingInvites.length} pending</span>
          ) : null}
        </p>
        {canInvite ? <InviteMemberForm /> : null}
      </div>

      {roster.length === 0 && pendingInvites.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No members yet"
          description="Invite the people who should be able to see calls, tickets and billing for this workspace."
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {roster.map((member) => {
            const name = member.full_name || member.email || "Unnamed member";
            const showEmail = Boolean(member.email && member.full_name);
            return (
              <li key={member.id} className="flex items-center gap-3 px-6 py-3.5">
                <Avatar name={name} seed={member.id} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">{name}</p>
                  {showEmail ? (
                    <p className="truncate text-xs text-gray-500">{member.email}</p>
                  ) : null}
                </div>
                <RolePill role={member.role} />
              </li>
            );
          })}

          {pendingInvites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-6 py-3.5">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-white/20"
              >
                <MailCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-600 dark:text-gray-300">{inv.email}</p>
                <p className="text-xs text-gray-500">Invitation sent — not accepted yet</p>
              </div>
              <div className="flex items-center gap-2">
                <RolePill role={inv.role} />
                <StatusPill tone="warn">Pending</StatusPill>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canInvite ? (
        <p className="flex items-center gap-1.5 border-t border-gray-100 px-6 py-3 text-xs text-gray-500 dark:border-white/10">
          <Lock aria-hidden="true" className="h-3.5 w-3.5" />
          Only admins and owners can invite members.
        </p>
      ) : null}
    </div>
  );
}

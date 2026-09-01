import { getViewer, roleCan } from "@/lib/auth/permissions";
import { countOwners, listInvites, listMembers } from "@/lib/members/roster";
import { MemberRoster } from "../members/_components/MemberRoster";

/**
 * Members — who can get into this workspace, and what they may do once in.
 *
 * The data-fetching half. Everything interactive lives in `MemberRoster` (a client component),
 * because role changes, removals and invite revocations all need optimistic-feeling feedback and a
 * confirmation dialog; the server's job is to answer three questions honestly — who is here, who is
 * invited, and what may the person reading this actually do — and hand those down.
 *
 * `ownerCount` is passed rather than derived in the client so the "last owner" rule is stated from
 * the same source the API enforces it from.
 */
export default async function MembersSection() {
  const viewer = await getViewer();
  if (!viewer.orgId) return null;

  const [members, invites, ownerCount] = await Promise.all([
    listMembers(viewer.orgId),
    listInvites(viewer.orgId),
    countOwners(viewer.orgId),
  ]);

  return (
    <MemberRoster
      members={members}
      invites={invites}
      viewerProfileId={viewer.profileId}
      viewerRole={viewer.role}
      canManageMembers={roleCan(viewer.role, "manage_members")}
      canGrantOwner={roleCan(viewer.role, "grant_owner")}
      ownerCount={ownerCount}
    />
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  Crown,
  Eye,
  Loader2,
  MailCheck,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { safeErrorMessage } from "@/lib/errors/safeErrorMessage";
import Avatar from "@/app/(app)/dashboard/_platform/Avatar";
import { EmptyState } from "@/app/(app)/dashboard/_platform/ui";
import { SettingsButton, StatusPill } from "@/app/(app)/dashboard/_platform/settings/ui";
import { InviteMemberForm } from "./InviteMemberForm";
import { RelativeTime } from "@/components/time/ClientTime";

/**
 * The roster, with the controls that make it a roster rather than a read-out.
 *
 * It could show you who was in the workspace and could do nothing about any of them: no role
 * change, no removal, no way to cancel an invitation sent to a typo'd address, and no sign of when
 * an invite would expire. Every one of those now has a control, and every control is hidden — not
 * merely disabled — when the viewer's role could not use it, because a greyed-out "Remove" on the
 * only owner reads as a bug rather than as a rule.
 *
 * The refusals are enforced server-side (`/api/members/*`); what is here is the same rules stated
 * so the person does not have to discover them by being refused.
 */

export type RosterMember = {
  profileId: string;
  email: string | null;
  fullName: string | null;
  role: "owner" | "admin" | "viewer" | null;
  lastSignInAt: string | null;
};

export type RosterInvite = {
  id: string;
  email: string;
  role: "owner" | "admin" | "viewer" | null;
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
};

type Props = {
  members: RosterMember[];
  invites: RosterInvite[];
  /** The viewer, so the row for "you" is marked and self-removal is not offered. */
  viewerProfileId: string | null;
  viewerRole: "owner" | "admin" | "viewer" | null;
  canManageMembers: boolean;
  canGrantOwner: boolean;
  ownerCount: number;
};

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

const ASSIGNABLE = [
  { value: "viewer", label: "Viewer", hint: "Reads conversations and reports. Changes nothing." },
  { value: "admin", label: "Admin", hint: "Manages settings, members, channels and billing." },
  { value: "owner", label: "Owner", hint: "Full control, including ownership itself." },
] as const;

export function MemberRoster({
  members,
  invites,
  viewerProfileId,
  viewerRole,
  canManageMembers,
  canGrantOwner,
  ownerCount,
}: Props) {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [roleTarget, setRoleTarget] = useState<RosterMember | null>(null);
  const [nextRole, setNextRole] = useState<"owner" | "admin" | "viewer">("admin");
  const [removeTarget, setRemoveTarget] = useState<RosterMember | null>(null);
  const [transferTarget, setTransferTarget] = useState<RosterMember | null>(null);

  const seatCount = members.length + invites.length;
  const otherMembers = useMemo(
    () => members.filter((m) => m.profileId !== viewerProfileId),
    [members, viewerProfileId]
  );

  const call = (
    input: RequestInfo,
    init: RequestInit,
    onDone: (message: string) => void,
    id: string
  ) => {
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await fetch(input, init);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          toastError(safeErrorMessage(data?.error, "That didn't work"));
          return;
        }
        onDone(data?.message || "Done");
        router.refresh();
      } catch (err) {
        toastError(safeErrorMessage(err, "That didn't work"));
      } finally {
        setBusyId(null);
      }
    });
  };

  const submitRole = () => {
    if (!roleTarget) return;
    const target = roleTarget;
    call(
      `/api/members/${target.profileId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      },
      (m) => {
        success(m);
        setRoleTarget(null);
      },
      target.profileId
    );
  };

  const submitRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    call(
      `/api/members/${target.profileId}`,
      { method: "DELETE" },
      (m) => {
        success(m);
        setRemoveTarget(null);
      },
      target.profileId
    );
  };

  const submitTransfer = () => {
    if (!transferTarget) return;
    const target = transferTarget;
    call(
      `/api/members/transfer-ownership`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: target.profileId }),
      },
      (m) => {
        success(m);
        setTransferTarget(null);
      },
      target.profileId
    );
  };

  const revokeInvite = (invite: RosterInvite) =>
    call(`/api/members/invites/${invite.id}`, { method: "DELETE" }, success, invite.id);

  const resendInvite = (invite: RosterInvite) =>
    call(`/api/members/invites/${invite.id}/resend`, { method: "POST" }, success, invite.id);

  /**
   * Whether this row can be acted on at all, and why not when it cannot. The last owner is the
   * interesting case: the rule is not "owners are untouchable", it is "a workspace must keep one".
   */
  const lockReason = (member: RosterMember): string | null => {
    if (!canManageMembers) return "Only owners and admins can manage members.";
    if (member.role === "owner" && ownerCount <= 1)
      return "This is the only owner. Transfer ownership or add another owner first.";
    if (member.role === "owner" && !canGrantOwner)
      return "Only the workspace owner can change another owner.";
    return null;
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-white/10">
        <p className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
          <Users aria-hidden="true" className="h-4 w-4 text-gray-400" />
          {seatCount} {seatCount === 1 ? "person" : "people"}
          {invites.length > 0 ? <span className="text-gray-400">· {invites.length} pending</span> : null}
        </p>
        {canManageMembers ? <InviteMemberForm canInviteOwner={canGrantOwner} /> : null}
      </div>

      {members.length === 0 && invites.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No members yet"
          description="Invite the people who should be able to see calls, tickets and billing for this workspace."
        />
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-white/10">
          {members.map((member) => {
            const name = member.fullName || member.email || "Unnamed member";
            const isYou = member.profileId === viewerProfileId;
            const locked = lockReason(member);
            const busy = busyId === member.profileId && isPending;

            return (
              <li key={member.profileId} className="flex items-center gap-3 px-6 py-3.5">
                <Avatar name={name} seed={member.profileId} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-navy-700 dark:text-white">
                    {name}
                    {isYou ? (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/10 dark:text-gray-300">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {member.email}
                    {member.email && member.lastSignInAt ? " · " : ""}
                    {member.lastSignInAt ? (
                      <>
                        last active <RelativeTime iso={member.lastSignInAt} />
                      </>
                    ) : member.email ? null : (
                      "No email on file"
                    )}
                  </p>
                </div>

                <RolePill role={member.role} />

                {canManageMembers ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Actions for ${name}`}
                        disabled={busy}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-navy-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-4 w-4" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-1.5">
                      {locked ? (
                        <p className="px-2.5 py-2 text-xs text-gray-500">{locked}</p>
                      ) : (
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => {
                              setNextRole(member.role === "admin" ? "viewer" : "admin");
                              setRoleTarget(member);
                            }}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-navy-700 transition hover:bg-gray-100 dark:text-white dark:hover:bg-white/10"
                          >
                            <ShieldCheck className="h-4 w-4 text-gray-400" />
                            Change role
                          </button>

                          {canGrantOwner && !isYou && member.role !== "owner" ? (
                            <button
                              type="button"
                              onClick={() => setTransferTarget(member)}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-navy-700 transition hover:bg-gray-100 dark:text-white dark:hover:bg-white/10"
                            >
                              <Crown className="h-4 w-4 text-gray-400" />
                              Transfer ownership
                            </button>
                          ) : null}

                          {isYou ? (
                            <p className="px-2.5 py-2 text-xs text-gray-500">
                              You cannot remove yourself. Ask another owner or admin.
                            </p>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRemoveTarget(member)}
                              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                            >
                              <UserMinus className="h-4 w-4" />
                              Remove from workspace
                            </button>
                          )}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                ) : null}
              </li>
            );
          })}

          {invites.map((inv) => {
            const busy = busyId === inv.id && isPending;
            return (
              <li key={inv.id} className="flex items-center gap-3 px-6 py-3.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-white/20"
                >
                  <MailCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-600 dark:text-gray-300">{inv.email}</p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Clock aria-hidden="true" className="h-3 w-3" />
                    {inv.expired ? (
                      <>Expired — re-send to give them another 14 days</>
                    ) : inv.expiresAt ? (
                      <>
                        Expires <RelativeTime iso={inv.expiresAt} />
                      </>
                    ) : (
                      <>Invitation sent — not accepted yet</>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <RolePill role={inv.role} />
                  <StatusPill tone={inv.expired ? "critical" : "warn"}>
                    {inv.expired ? "Expired" : "Pending"}
                  </StatusPill>

                  {canManageMembers ? (
                    <>
                      <button
                        type="button"
                        onClick={() => resendInvite(inv)}
                        disabled={busy}
                        aria-label={`Re-send the invitation to ${inv.email}`}
                        title="Re-send invitation"
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-navy-700 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeInvite(inv)}
                        disabled={busy}
                        aria-label={`Cancel the invitation to ${inv.email}`}
                        title="Cancel invitation"
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!canManageMembers ? (
        <p className="flex items-center gap-1.5 border-t border-gray-100 px-6 py-3 text-xs text-gray-500 dark:border-white/10">
          <Eye aria-hidden="true" className="h-3.5 w-3.5" />
          You can see who has access. Owners and admins manage it.
        </p>
      ) : null}

      {/* Change role */}
      <Dialog open={Boolean(roleTarget)} onOpenChange={(o) => !o && !isPending && setRoleTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand-500" />
              Change role
            </DialogTitle>
            <DialogDescription>
              {roleTarget ? `What should ${roleTarget.fullName || roleTarget.email} be able to do?` : null}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Select value={nextRole} onValueChange={(v) => setNextRole(v as typeof nextRole)}>
              <SelectTrigger
                aria-label="Role"
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm shadow-sm dark:border-white/10 dark:bg-navy-900"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE.filter((r) => r.value !== "owner" || canGrantOwner).map((r) => (
                  <SelectItem key={r.value} value={r.value} className="py-2">
                    <span className="font-medium">{r.label}</span>
                    <span className="ml-2 text-xs text-gray-500">{r.hint}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {nextRole === "owner" ? (
              <p className="mt-3 text-xs text-gray-500">
                A second owner has the same powers you do, including billing and removing members.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <SettingsButton type="button" variant="ghost" onClick={() => setRoleTarget(null)} disabled={isPending}>
              Cancel
            </SettingsButton>
            <SettingsButton type="button" variant="primary" onClick={submitRole} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
              {isPending ? "Saving…" : "Change role"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={Boolean(removeTarget)} onOpenChange={(o) => !o && !isPending && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Remove from workspace?
            </DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `${removeTarget.fullName || removeTarget.email} loses access to this workspace immediately. Their Denku account is not deleted, and you can invite them back.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SettingsButton type="button" variant="ghost" onClick={() => setRemoveTarget(null)} disabled={isPending}>
              Cancel
            </SettingsButton>
            <SettingsButton type="button" variant="danger" onClick={submitRemove} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <UserMinus />}
              {isPending ? "Removing…" : "Remove"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer ownership */}
      <Dialog open={Boolean(transferTarget)} onOpenChange={(o) => !o && !isPending && setTransferTarget(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-brand-500" />
              Transfer ownership?
            </DialogTitle>
            <DialogDescription>
              {transferTarget
                ? `${transferTarget.fullName || transferTarget.email} becomes the workspace owner and you become an admin. Only they will be able to transfer it back.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => setTransferTarget(null)}
              disabled={isPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton type="button" variant="danger" onClick={submitTransfer} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Crown />}
              {isPending ? "Transferring…" : "Transfer ownership"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewerRole === "owner" && otherMembers.length === 0 ? (
        <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500 dark:border-white/10">
          You are the only person here. Invite someone before you need to hand this over.
        </p>
      ) : null}
    </div>
  );
}

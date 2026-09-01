import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guard, ROLE_LABEL, type Role } from "@/lib/auth/permissions";
import { assertNotLastOwner, findMember, memberLabel } from "@/lib/members/roster";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * One member: change their role, or remove them.
 *
 * Membership in this product is `profiles.org_id` — there is no members table — so "remove" means
 * detaching the profile from the org, not deleting the person's account. That distinction matters:
 * the removed person keeps their login and their name; they simply have no workspace until someone
 * invites them again. Deleting their auth user would be a different, far more destructive thing,
 * and this route deliberately does not do it.
 *
 * Three refusals are enforced here rather than in the UI, because the UI is not the boundary:
 *   * only an OWNER may grant or take the `owner` role (`grant_owner`);
 *   * the last owner may not be demoted or removed — a workspace with no owner has no one who can
 *     take a billing decision, and no way back;
 *   * you cannot remove yourself, which is a footgun disguised as a convenience.
 */

const RoleSchema = z.object({ role: z.enum(["owner", "admin", "viewer"]) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await ctx.params;

  const gate = await guard("manage_members");
  if (!gate.ok) return gate.response;
  const { orgId, profileId: actorId, role: actorRole } = gate.viewer;

  const parsed = RoleSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Pick a valid role" }, { status: 400 });
  }
  const nextRole: Role = parsed.data.role;

  const target = await findMember(orgId, memberId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "That person is not in this workspace" }, { status: 404 });
  }
  if (target.role === nextRole) {
    return NextResponse.json({ ok: true, role: nextRole, unchanged: true });
  }

  // Granting owner, and taking owner away, are both owner-only. An admin who could do either
  // could promote themselves through a second account, which makes `admin` and `owner` the
  // same role wearing different labels.
  if ((nextRole === "owner" || target.role === "owner") && actorRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the workspace owner can grant or remove the owner role." },
      { status: 403 }
    );
  }

  const lastOwner = await assertNotLastOwner(orgId, target, "change the role of");
  if (lastOwner) return NextResponse.json({ ok: false, error: lastOwner.error }, { status: lastOwner.status });

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[MEMBERS][ROLE][FAILED]", error.message);
    return NextResponse.json({ ok: false, error: "Could not change that role" }, { status: 500 });
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: actorId,
    action: "member.role.change",
    entity_type: "member",
    entity_id: memberId,
    diff: { role: { before: target.role, after: nextRole } },
  });

  return NextResponse.json({
    ok: true,
    role: nextRole,
    message: `${memberLabel(target)} is now ${ROLE_LABEL[nextRole].toLowerCase()}.`,
  });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await ctx.params;

  const gate = await guard("manage_members");
  if (!gate.ok) return gate.response;
  const { orgId, profileId: actorId, role: actorRole } = gate.viewer;

  if (memberId === actorId) {
    return NextResponse.json(
      { ok: false, error: "You cannot remove yourself. Ask another owner or admin to do it." },
      { status: 400 }
    );
  }

  const target = await findMember(orgId, memberId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "That person is not in this workspace" }, { status: 404 });
  }

  if (target.role === "owner" && actorRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the workspace owner can remove another owner." },
      { status: 403 }
    );
  }

  const lastOwner = await assertNotLastOwner(orgId, target, "remove");
  if (lastOwner) return NextResponse.json({ ok: false, error: lastOwner.error }, { status: lastOwner.status });

  // Detach, do not delete. The person keeps their account; they lose this workspace.
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ org_id: null, role: "viewer", updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[MEMBERS][REMOVE][FAILED]", error.message);
    return NextResponse.json({ ok: false, error: "Could not remove that member" }, { status: 500 });
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: actorId,
    action: "member.remove",
    entity_type: "member",
    entity_id: memberId,
    diff: {
      member: { before: memberLabel(target), after: null },
      role: { before: target.role, after: null },
    },
  });

  return NextResponse.json({ ok: true, message: `${memberLabel(target)} no longer has access.` });
}

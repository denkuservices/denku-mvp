import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guard } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * Revoke a pending invitation.
 *
 * The invite was previously a one-way door: once sent, the only way to stop someone joining was to
 * hope they never signed up — the acceptance path (`consumeInviteForEmail`) matches on email at
 * signup and would have attached them weeks later. Revoking flips `status` so acceptance finds
 * nothing, and the row is kept rather than deleted so the audit trail can still say who invited
 * whom and who called it back.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await ctx.params;

  const gate = await guard("manage_members");
  if (!gate.ok) return gate.response;
  const { orgId, profileId: actorId } = gate.viewer;

  const { data: invite } = await supabaseAdmin
    .from("org_invites")
    .select("id, email, role, status")
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; email: string; role: string; status: string }>();

  if (!invite) {
    return NextResponse.json({ ok: false, error: "That invitation no longer exists" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "That invitation has already been used or cancelled" },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("org_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: actorId })
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .eq("status", "pending"); // conditional: a race with acceptance loses, and should

  if (error) {
    console.error("[MEMBERS][INVITE][REVOKE][FAILED]", error.message);
    return NextResponse.json({ ok: false, error: "Could not cancel that invitation" }, { status: 500 });
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: actorId,
    action: "member.invite.revoke",
    entity_type: "member.invite",
    entity_id: inviteId,
    diff: { status: { before: "pending", after: "revoked" }, email: { before: invite.email, after: invite.email } },
  });

  return NextResponse.json({ ok: true, message: `The invitation to ${invite.email} was cancelled.` });
}

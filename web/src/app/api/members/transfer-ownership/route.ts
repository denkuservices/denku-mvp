import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { guard } from "@/lib/auth/permissions";
import { findMember, memberLabel } from "@/lib/members/roster";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * Hand the workspace to someone else.
 *
 * There was no way to do this at all: `owner` was whatever the signup path happened to write, and a
 * business whose founder left had no route to move it. Promoting a second owner and demoting the
 * first from application code would leave a window with two owners (or, if the second write failed,
 * none), so the swap is a single SECURITY DEFINER function —
 * `transfer_org_ownership` — which also re-checks that the caller is the owner inside the database.
 * The capability check here is the same rule stated twice on purpose: the API refuses early with a
 * sentence a person can read, and the database refuses regardless of what called it.
 *
 * Called with the COOKIE client, not the service role: the function authorizes on `auth.uid()`.
 */

const Schema = z.object({ memberId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const gate = await guard("grant_owner");
  if (!gate.ok) return gate.response;
  const { orgId, profileId: actorId } = gate.viewer;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Choose who should become the owner" }, { status: 400 });
  }
  const { memberId } = parsed.data;

  if (memberId === actorId) {
    return NextResponse.json({ ok: false, error: "You are already the owner." }, { status: 400 });
  }

  const target = await findMember(orgId, memberId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "That person is not in this workspace" }, { status: 404 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transfer_org_ownership", {
    p_org_id: orgId,
    p_to_profile: memberId,
  });

  if (error) {
    console.error("[MEMBERS][OWNERSHIP][TRANSFER][FAILED]", error.message);
    // 42501 is the function's own "you are not the owner" — surface it as a refusal, not a fault.
    const denied = error.code === "42501";
    return NextResponse.json(
      { ok: false, error: denied ? "Only the workspace owner can transfer ownership." : "Could not transfer ownership" },
      { status: denied ? 403 : 500 }
    );
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: actorId,
    action: "workspace.ownership.transfer",
    entity_type: "workspace",
    entity_id: orgId,
    diff: {
      owner: { before: actorId, after: memberId },
      previous_owner_role: { before: "owner", after: "admin" },
    },
  });

  return NextResponse.json({
    ok: true,
    message: `${memberLabel(target)} is now the workspace owner. You are an admin.`,
  });
}

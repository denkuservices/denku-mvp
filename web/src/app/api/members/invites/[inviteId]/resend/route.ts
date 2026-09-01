import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { guard } from "@/lib/auth/permissions";
import { sendMemberInviteEmail } from "@/lib/email/send";
import { memberInviteTemplate } from "@/lib/email/templates/memberInvite";
import { getBaseUrl } from "@/lib/utils/url";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/** A re-send also pushes the expiry out; an invitation nobody could accept is not worth re-sending. */
const EXTENSION_DAYS = 14;

/**
 * Re-send a pending invitation.
 *
 * Invites are the one email in the estate sent to someone who has never heard of Denku, so they
 * land in spam more often than anything else we send — and until now the only remedy was to ask
 * the admin to invite the same person again, which the unique index on (org, email) refused.
 *
 * Rate-limited to one send a minute per invitation, counted from `last_sent_at` in the DB rather
 * than from `lib/rateLimit.ts`, which is an in-memory Map and therefore a no-op on Vercel.
 */
const RESEND_COOLDOWN_MS = 60_000;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ inviteId: string }> }) {
  const { inviteId } = await ctx.params;

  const gate = await guard("manage_members");
  if (!gate.ok) return gate.response;
  const { orgId, profileId: actorId } = gate.viewer;

  const { data: invite } = await supabaseAdmin
    .from("org_invites")
    .select("id, email, role, status, last_sent_at")
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .maybeSingle<{
      id: string;
      email: string;
      role: string;
      status: string;
      last_sent_at: string | null;
    }>();

  if (!invite) {
    return NextResponse.json({ ok: false, error: "That invitation no longer exists" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: "That invitation has already been used or cancelled" },
      { status: 409 }
    );
  }

  if (invite.last_sent_at && Date.now() - Date.parse(invite.last_sent_at) < RESEND_COOLDOWN_MS) {
    return NextResponse.json(
      { ok: false, error: "That invitation was just sent. Give it a minute before trying again." },
      { status: 429 }
    );
  }

  const [{ data: org }, { data: actor }] = await Promise.all([
    supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
    supabaseAdmin.from("profiles").select("full_name").eq("id", actorId).maybeSingle<{ full_name: string | null }>(),
  ]);

  const orgName = org?.name || "your Denku workspace";
  const signupUrl = `${getBaseUrl()}/signup?email=${encodeURIComponent(invite.email)}`;

  const mail = await sendMemberInviteEmail(
    invite.email,
    memberInviteTemplate({ orgName, inviterName: actor?.full_name ?? null, signupUrl })
  );

  // Stamp the send and push the expiry out together — an invitation that arrives on day 13 of a
  // 14-day window is barely an invitation.
  const expiresAt = new Date(Date.now() + EXTENSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("org_invites")
    .update({ last_sent_at: new Date().toISOString(), expires_at: expiresAt })
    .eq("id", inviteId)
    .eq("org_id", orgId);

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: actorId,
    action: "member.invite.resend",
    entity_type: "member.invite",
    entity_id: inviteId,
    diff: { email: { before: invite.email, after: invite.email } },
  });

  // Report what actually happened. The expiry moved either way; the email may not have.
  return NextResponse.json({
    ok: true,
    emailed: mail.ok,
    message: mail.ok
      ? `Invitation re-sent to ${invite.email}.`
      : `The invitation is still valid, but the email could not be sent. They can join by signing up with ${invite.email}.`,
  });
}

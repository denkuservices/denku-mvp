import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/members/invites";
import { sendMemberInviteEmail } from "@/lib/email/send";
import { memberInviteTemplate } from "@/lib/email/templates/memberInvite";
import { getBaseUrl } from "@/lib/utils/url";
import { guard } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * Member invite — SESSION-authenticated, customer-reachable (Sprint 6, L4 / R-010).
 *
 * Lives under /api/members/* (NOT /api/admin/*, which the middleware Basic-Auth gate would
 * 401 for customers — the original bug). Creates a real pending invite and emails the invitee a
 * signup link. Honest: if the `org_invites` migration is not applied it reports that plainly
 * instead of faking success.
 *
 * Two things changed after the settings audit:
 *
 *   * **`viewer` is invitable.** The role existed in the data model and in the roster pill, and
 *     was the one role you could not actually give anyone — so a business that wanted a
 *     read-only bookkeeper had to make them an admin, which is the opposite of what they asked for.
 *   * **Only an owner may invite an owner.** An admin creating a second owner is an admin granting
 *     themselves, through a second address, everything `admin` was deliberately not given.
 *
 * The profile is resolved through `getViewer` (lib/auth/permissions) rather than a local
 * `profiles.id` lookup. This route keyed on `id` while the billing routes keyed on `auth_user_id`;
 * for a workspace where those diverge the two disagreed about who you were.
 */

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["viewer", "admin", "owner"]),
});

export async function POST(req: NextRequest) {
  const gate = await guard("manage_members");
  if (!gate.ok) return gate.response;
  const { orgId, profileId, role: actorRole } = gate.viewer;

  const parsed = InviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email and role" }, { status: 400 });
  }
  const { role } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  if (role === "owner" && actorRole !== "owner") {
    return NextResponse.json(
      { ok: false, error: "Only the workspace owner can invite another owner." },
      { status: 403 }
    );
  }

  // Guard: already a member of this org?
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, org_id")
    .eq("email", email)
    .maybeSingle<{ id: string; org_id: string | null }>();
  if (existing?.org_id === orgId) {
    return NextResponse.json(
      { ok: false, error: "That person is already a member of this workspace" },
      { status: 400 }
    );
  }

  const result = await createInvite({ orgId, email, role, invitedBy: profileId }, supabaseAdmin);

  if (!result.ok) {
    if (result.reason === "not_enabled") {
      return NextResponse.json(
        { ok: false, error: "Member invites aren't enabled yet. Please try again shortly." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "Could not create the invitation" }, { status: 500 });
  }

  // Resolve the workspace name and the inviter for the email (best-effort).
  const [{ data: org }, { data: actor }] = await Promise.all([
    supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
    supabaseAdmin
      .from("profiles")
      .select("full_name, ui_locale")
      .eq("id", profileId)
      .maybeSingle<{ full_name: string | null; ui_locale: "en" | "es" | "de" | "tr" | null }>(),
  ]);
  const orgName = org?.name || "your Denku workspace";
  const signupUrl = `${getBaseUrl()}/signup?email=${encodeURIComponent(email)}`;

  // Non-fatal: the invite exists even if the email fails; report truthfully.
  const mail = await sendMemberInviteEmail(
    email,
    memberInviteTemplate({ orgName, inviterName: actor?.full_name ?? null, signupUrl, locale: actor?.ui_locale ?? "en" })
  );

  if (result.id) {
    await supabaseAdmin
      .from("org_invites")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("id", result.id);
  }

  await logAuditEvent({
    org_id: orgId,
    actor_user_id: profileId,
    action: "member.invite",
    entity_type: "member.invite",
    entity_id: result.id ?? orgId,
    diff: { email: { before: null, after: email }, role: { before: null, after: role } },
  });

  return NextResponse.json({
    ok: true,
    emailed: mail.ok,
    message: mail.ok
      ? `Invitation sent to ${email}. They'll join ${orgName} when they sign up with this email.`
      : `Invitation created for ${email}, but the email couldn't be sent. They can still join by signing up with this email.`,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createInvite } from "@/lib/members/invites";
import { sendMemberInviteEmail } from "@/lib/email/send";
import { memberInviteTemplate } from "@/lib/email/templates/memberInvite";
import { getBaseUrl } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

/**
 * Member invite — SESSION-authenticated, customer-reachable (Sprint 6, L4 / R-010).
 *
 * Lives under /api/members/* (NOT /api/admin/*, which the middleware Basic-Auth gate would
 * 401 for customers — the original bug). Verifies the caller is an admin/owner of their org,
 * creates a real pending invite, and emails the invitee a signup link. Honest: if the
 * org_invites migration isn't applied yet it reports that plainly instead of faking success.
 */

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "owner"]),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, org_id, role, full_name")
    .eq("id", auth.user.id)
    .maybeSingle<{ id: string; org_id: string | null; role: string | null; full_name: string | null }>();

  if (!profile?.org_id) {
    return NextResponse.json({ ok: false, error: "No organization found" }, { status: 400 });
  }
  if (profile.role !== "admin" && profile.role !== "owner") {
    return NextResponse.json({ ok: false, error: "Only admins and owners can invite members" }, { status: 403 });
  }

  const parsed = InviteSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid email and role" }, { status: 400 });
  }
  const { email, role } = parsed.data;

  // Guard: already a member of this org?
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id, org_id")
    .eq("email", email)
    .maybeSingle<{ id: string; org_id: string | null }>();
  if (existing?.org_id === profile.org_id) {
    return NextResponse.json({ ok: false, error: "That person is already a member of this workspace" }, { status: 400 });
  }

  const result = await createInvite(
    { orgId: profile.org_id, email, role, invitedBy: profile.id },
    supabaseAdmin
  );

  if (!result.ok) {
    if (result.reason === "not_enabled") {
      return NextResponse.json(
        { ok: false, error: "Member invites aren't enabled yet. Please try again shortly." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: "Could not create the invitation" }, { status: 500 });
  }

  // Resolve the workspace name for the email (best-effort).
  const { data: org } = await supabaseAdmin.from("orgs").select("name").eq("id", profile.org_id).maybeSingle<{ name: string | null }>();
  const orgName = org?.name || "your Denku workspace";
  const signupUrl = `${getBaseUrl()}/signup?email=${encodeURIComponent(email)}`;

  // Non-fatal: the invite exists even if the email fails; report truthfully.
  const mail = await sendMemberInviteEmail(email, memberInviteTemplate({ orgName, inviterName: profile.full_name, signupUrl }));

  return NextResponse.json({
    ok: true,
    emailed: mail.ok,
    message: mail.ok
      ? `Invitation sent to ${email}. They'll join ${orgName} when they sign up with this email.`
      : `Invitation created for ${email}, but the email couldn't be sent. They can still join by signing up with this email.`,
  });
}

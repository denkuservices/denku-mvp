import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { guard } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getEffectiveLimits, isWorkspacePaused } from "@/lib/billing/limits";
import { isPreviewMode } from "@/lib/billing/isPreviewMode";
import { byoNumbersEnabled } from "@/lib/platform/flags";
import { toE164 } from "@/lib/vapi/sipTrunk";
import { connectByoNumber } from "@/lib/phone-lines/connectByo";

/**
 * POST /api/phone-lines/connect — connect a number the customer already owns (BYO SIP).
 *
 * The sibling of `/purchase`. No Stripe call happens here: connecting a number the customer
 * already pays their own carrier for does not rent anything from us. It still consumes a line
 * slot, so it is counted against `included_phones` exactly like a purchased line — otherwise a
 * workspace could add unlimited concurrent capacity for free, and `rebindOrgPhoneNumbers`'s limit
 * check (which counts bound numbers) would start disagreeing with billing.
 *
 * The SIP password travels through this route to Vapi and is never written down: not to
 * `sip_trunks`, not to logs, not into the response.
 */

const CarrierSchema = z.object({
  providerKey: z.string().max(40).optional().nullable(),
  name: z.string().max(60).optional().nullable(),
  gatewayHost: z.string().min(3).max(200),
  gatewayPort: z.number().int().min(1).max(65535).optional().nullable(),
  authUsername: z.string().max(120).optional().nullable(),
  authPassword: z.string().max(200).optional().nullable(),
});

const BodySchema = z
  .object({
    number: z.string().min(6).max(24),
    displayName: z.string().max(60).optional().nullable(),
    lineType: z.enum(["support", "sales", "after_hours"]).optional(),
    trunkId: z.string().uuid().optional().nullable(),
    carrier: CarrierSchema.optional().nullable(),
  })
  .refine((b) => Boolean(b.trunkId) || Boolean(b.carrier), {
    message: "Either an existing trunkId or carrier details are required",
  });

export async function POST(req: NextRequest) {
  try {
    if (!byoNumbersEnabled()) {
      return NextResponse.json(
        { ok: false, error: "Connecting your own number is not enabled yet" },
        { status: 404 }
      );
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
    }

    // The number Vapi matches inbound calls against. A malformed one fails silently later —
    // the call simply never maps to a line — so refuse it here instead.
    const numberE164 = toE164(parsed.data.number);
    if (!numberE164) {
      return NextResponse.json(
        { ok: false, error: "That does not look like a valid phone number" },
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .maybeSingle<{ org_id: string | null }>();

    const orgId = profile?.org_id ?? null;

    // A phone line is the business's front door: pausing, renaming, re-pointing or
    // deleting one changes who answers a real customer. `manage_channels` is owner/admin —
    // a viewer reads what the line did, and changes nothing about it.
    const gate = await guard("manage_channels");
    if (!gate.ok) return gate.response;

    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Organization not found" }, { status: 400 });
    }

    if (await isWorkspacePaused(orgId)) {
      return NextResponse.json(
        { ok: false, error: "Workspace is paused. Please contact support." },
        { status: 409 }
      );
    }

    if (await isPreviewMode(orgId)) {
      return NextResponse.json(
        { ok: false, error: "Choose a plan before connecting a phone number" },
        { status: 402 }
      );
    }

    // Line slots: BYO lines count like any other. Counting `phone_lines` (not `agents`) is
    // deliberate — it is the table that holds one row per line regardless of provider.
    const limits = await getEffectiveLimits(orgId);
    const { count: lineCount } = await supabaseAdmin
      .from("phone_lines")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId);

    if ((lineCount ?? 0) >= limits.included_phones) {
      return NextResponse.json(
        {
          ok: false,
          error: `Your plan includes ${limits.included_phones} phone line(s). Add an extra line to connect another number.`,
        },
        { status: 402 }
      );
    }

    const result = await connectByoNumber({
      orgId,
      userId: user.id,
      numberE164,
      displayName: parsed.data.displayName ?? null,
      lineType: parsed.data.lineType,
      trunkId: parsed.data.trunkId ?? null,
      carrier: parsed.data.carrier ?? null,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "Could not connect this number" },
        { status: result.status ?? 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        lineId: result.lineId,
        trunkId: result.trunkId,
        verificationStatus: result.verificationStatus,
        instructions: result.instructions,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[phone-lines/connect] unexpected error", err);
    return NextResponse.json({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sipDestinationForLine, KNOWN_SIP_CARRIERS, type KnownCarrierKey } from "@/lib/vapi/sipTrunk";
import { VAPI_INBOUND_IPS } from "@/lib/phone-lines/connectByo";

/**
 * GET /api/phone-lines/[lineId]/status
 *
 * Small on purpose: the connect wizard polls this every few seconds while the customer is in
 * their carrier's panel, waiting for the first inbound call to prove the line is theirs. It
 * returns state, never secrets — no trunk credentials, no Vapi ids beyond what the UI already
 * has.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await ctx.params;

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .maybeSingle<{ org_id: string | null }>();

    const orgId = profile?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Organization not found" }, { status: 400 });
    }

    // Service-role read, so the org filter IS the tenant boundary — never drop it.
    const { data: line, error } = await supabaseAdmin
      .from("phone_lines")
      .select("id, status, provider, verification_status, verified_at, phone_number_e164, sip_trunk_id")
      .eq("org_id", orgId)
      .eq("id", lineId)
      .maybeSingle<{
        id: string;
        status: string | null;
        provider: string | null;
        verification_status: string | null;
        verified_at: string | null;
        phone_number_e164: string | null;
        sip_trunk_id: string | null;
      }>();

    if (error || !line) {
      return NextResponse.json({ ok: false, error: "Line not found" }, { status: 404 });
    }

    // For a connected line, hand back the carrier instructions as well. A customer who closed
    // the wizard has nowhere else to find these, and "call support to re-read your own settings"
    // is not a product. Derived from the trunk, never stored twice — and the SIP password is not
    // part of it, because we never kept it.
    let instructions: Record<string, unknown> | null = null;
    if (line.provider === "byo_sip" && line.sip_trunk_id) {
      const { data: trunk } = await supabaseAdmin
        .from("sip_trunks")
        .select("vapi_credential_id, provider_key, gateway_host, auth_username")
        .eq("org_id", orgId)
        .eq("id", line.sip_trunk_id)
        .maybeSingle<{
          vapi_credential_id: string | null;
          provider_key: string | null;
          gateway_host: string | null;
          auth_username: string | null;
        }>();

      if (trunk?.vapi_credential_id && line.phone_number_e164) {
        const dest = sipDestinationForLine(line.phone_number_e164, trunk.vapi_credential_id);
        const known =
          trunk.provider_key && trunk.provider_key in KNOWN_SIP_CARRIERS
            ? KNOWN_SIP_CARRIERS[trunk.provider_key as KnownCarrierKey]
            : null;
        instructions = {
          carrier: known?.label ?? trunk.provider_key ?? "your provider",
          gatewayHost: trunk.gateway_host,
          authUsername: trunk.auth_username,
          forwardHost: dest.host,
          forwardPort: dest.port,
          perCredentialUri: dest.perCredentialUri,
          calledPrefix: known?.calledPrefix ?? null,
          callerPrefix: known?.callerPrefix ?? null,
          vapiInboundIps: VAPI_INBOUND_IPS,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      instructions,
      lineId: line.id,
      status: line.status,
      provider: line.provider ?? "vapi",
      // Pre-BYO rows have no verification column value worth surfacing; they were provisioned by
      // Denku and need no proof, so they read as verified.
      verificationStatus: line.verification_status ?? "verified",
      verifiedAt: line.verified_at,
      phoneNumberE164: line.phone_number_e164,
    });
  } catch (err) {
    console.error("[phone-lines/status] unexpected error", err);
    return NextResponse.json({ ok: false, error: "internal_server_error" }, { status: 500 });
  }
}

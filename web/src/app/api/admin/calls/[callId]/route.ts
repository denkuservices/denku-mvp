// src/app/api/admin/calls/[callId]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function parseBasicAuth(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return null;

  const b64 = auth.slice("Basic ".length).trim();
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    const [user, pass] = decoded.split(":");
    if (!user || !pass) return null;
    return { user, pass };
  } catch {
    return null;
  }
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ callId: string }> }
) {
  try {
    const { callId } = await ctx.params;

    // ✅ Basic Auth guard (ADMIN_USER / ADMIN_PASS)
    const creds = parseBasicAuth(req);
    if (!creds) return unauthorized();

    const expectedUser = process.env.ADMIN_USER || "";
    const expectedPass = process.env.ADMIN_PASS || "";
    if (!expectedUser || !expectedPass) return unauthorized();
    if (creds.user !== expectedUser || creds.pass !== expectedPass) return unauthorized();

    const select =
      "id, vapi_call_id, agent_id, org_id, started_at, ended_at, duration_seconds, cost_usd, outcome, transcript, raw_payload, created_at";

    // ✅ Support both:
    // - /api/admin/calls/<uuid>  (calls.id)
    // - /api/admin/calls/<vapi_call_id> (calls.vapi_call_id)
    const query = supabaseAdmin.from("calls").select(select).limit(1);

    const { data, error } = isUuid(callId)
      ? await query.eq("id", callId).maybeSingle()
      : await query.eq("vapi_call_id", callId).maybeSingle();

    if (error) {
      console.error("call detail query failed", { callId, error });
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: true, data: null }, { status: 200 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (err) {
    console.error("call detail endpoint error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

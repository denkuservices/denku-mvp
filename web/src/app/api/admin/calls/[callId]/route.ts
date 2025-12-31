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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ callId: string }> }
) {
  try {
    // Basic Auth
    const creds = parseBasicAuth(req);
    if (!creds) return unauthorized();
    const expectedUser = process.env.ADMIN_USER || "";
    const expectedPass = process.env.ADMIN_PASS || "";
    if (!expectedUser || !expectedPass) return unauthorized();
    if (creds.user !== expectedUser || creds.pass !== expectedPass) return unauthorized();

    // Next 15 params promise
    const { callId } = await ctx.params;

    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("id, vapi_call_id, agent_id, org_id, started_at, ended_at, duration_seconds, cost_usd, outcome, transcript, raw_payload, created_at")
      .eq("id", callId)
      .single();

    if (error) {
      console.error("call detail query failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("call detail endpoint error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

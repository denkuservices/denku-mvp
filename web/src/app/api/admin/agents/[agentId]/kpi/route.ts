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
  ctx: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await ctx.params;

    // Basic Auth guard
    const creds = parseBasicAuth(req);
    if (!creds) return unauthorized();

    const expectedUser = process.env.ADMIN_USER || "";
    const expectedPass = process.env.ADMIN_PASS || "";
    if (!expectedUser || !expectedPass) return unauthorized();
    if (creds.user !== expectedUser || creds.pass !== expectedPass)
      return unauthorized();

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(Number(searchParams.get("days") ?? "7"), 90));

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("started_at, duration_seconds, cost_usd, outcome")
      .eq("agent_id", agentId)
      .gte("started_at", since)
      .order("started_at", { ascending: false });

    if (error) {
      console.error("kpi query failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const totalCalls = data?.length ?? 0;

    const totalCost =
      data?.reduce((sum, c: any) => sum + (Number(c.cost_usd) || 0), 0) ?? 0;

    const totalDuration =
      data?.reduce((sum, c: any) => sum + (Number(c.duration_seconds) || 0), 0) ?? 0;

    const completedCalls =
      data?.filter((c: any) => (c.outcome || "").toString().toLowerCase() === "completed")
        .length ?? 0;

    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

    return NextResponse.json({
      ok: true,
      agent_id: agentId,
      days,
      total_calls: totalCalls,
      total_cost_usd: Number(totalCost.toFixed(4)),
      avg_duration_sec: Number(avgDuration.toFixed(2)),
      success_rate_pct: Number(successRate.toFixed(2)),
    });
  } catch (err) {
    console.error("kpi endpoint error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

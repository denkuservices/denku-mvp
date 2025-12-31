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

    // Basic Auth
    const creds = parseBasicAuth(req);
    if (!creds) return unauthorized();

    if (
      creds.user !== process.env.ADMIN_USER ||
      creds.pass !== process.env.ADMIN_PASS
    ) {
      return unauthorized();
    }

    const { searchParams } = new URL(req.url);
    const days = Number(searchParams.get("days") ?? "7");

    const since = new Date();
    since.setDate(since.getDate() - days);

    // 🔧 FIX: agent_id = agentId OR agent_id IS NULL
    const { data, error } = await supabaseAdmin
      .from("calls")
      .select("started_at, duration_sec, cost_usd, outcome")
      .or(`agent_id.eq.${agentId},agent_id.is.null`)
      .gte("started_at", since.toISOString());

    if (error) {
      console.error("agent kpi query failed", error);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    const totalCalls = data?.length ?? 0;
    const totalCost =
      data?.reduce((sum, c) => sum + (c.cost_usd ?? 0), 0) ?? 0;
    const totalDuration =
      data?.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0) ?? 0;

    return NextResponse.json({
      days,
      total_calls: totalCalls,
      total_cost_usd: totalCost,
      avg_duration_sec: totalCalls > 0 ? totalDuration / totalCalls : 0,
      success_rate:
        totalCalls > 0
          ? data.filter((c) => c.outcome === "Completed").length / totalCalls
          : 0,
    });
  } catch (err) {
    console.error("agent kpi endpoint error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

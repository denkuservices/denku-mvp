import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await ctx.params; // <-- kritik fix

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? "30")));
    const fromIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Agent + org doğrula
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("id, org_id, name")
      .eq("id", agentId)
      .maybeSingle();

    if (agentErr || !agent?.id || !agent.org_id) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
    }

    // KPI hesapla
    const { data: calls, error: callsErr } = await supabaseAdmin
      .from("calls")
      .select("duration_seconds, cost_usd")
      .eq("org_id", agent.org_id)
      .eq("agent_id", agentId)
      .gte("started_at", fromIso);

    if (callsErr) {
      return NextResponse.json({ error: "calls_query_failed" }, { status: 500 });
    }

    const total_calls = calls?.length ?? 0;
    const total_duration_seconds = (calls ?? []).reduce(
      (sum, r: any) => sum + (r.duration_seconds ?? 0),
      0
    );
    const total_cost_usd = (calls ?? []).reduce(
      (sum, r: any) => sum + Number(r.cost_usd ?? 0),
      0
    );

    return NextResponse.json({
      ok: true,
      agent: { id: agent.id, name: agent.name, org_id: agent.org_id },
      window_days: days,
      kpi: {
        total_calls,
        total_minutes: total_duration_seconds / 60,
        total_cost_usd,
        avg_duration_seconds: total_calls ? total_duration_seconds / total_calls : 0,
      },
    });
  } catch (e) {
    console.error("KPI route error:", e);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

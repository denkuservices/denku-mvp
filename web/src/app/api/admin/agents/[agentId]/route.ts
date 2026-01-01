import { NextRequest, NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth/basic";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ agentId: string }> }
) {
  // 1) Basic Auth
  if (!requireBasicAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin Area"' },
    });
  }

  const { agentId } = await ctx.params;

  // 2) Fetch agent (minimal columns that exist)
  const { data: agent, error: aErr } = await supabaseAdmin
    .from("agents")
    .select("id, org_id, name, created_at, vapi_assistant_id, vapi_phone_number_id")
    .eq("id", agentId)
    .single();

  if (aErr || !agent) {
    return NextResponse.json(
      { ok: false, error: "Agent not found", details: aErr?.message },
      { status: 404 }
    );
  }

  // 3) Calls last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let calls: any[] = [];
  const warnings: string[] = [];

  // A) Try by agent_id
  const byAgentId = await supabaseAdmin
    .from("calls")
    .select(
      "id, started_at, ended_at, duration_seconds, cost_usd, outcome, created_at, vapi_call_id, transcript, agent_id"
    )
    .eq("agent_id", agentId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (byAgentId.error) {
    warnings.push(byAgentId.error.message);
  } else {
    calls = byAgentId.data ?? [];
  }

  // B) If empty, try by vapi_assistant_id (if calls table has that column)
  if (calls.length === 0 && agent.vapi_assistant_id) {
    const byVapiAssistant = await supabaseAdmin
      .from("calls")
      .select(
        "id, started_at, ended_at, duration_seconds, cost_usd, outcome, created_at, vapi_call_id, transcript, vapi_assistant_id"
      )
      .eq("vapi_assistant_id", agent.vapi_assistant_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (byVapiAssistant.error) {
      warnings.push(byVapiAssistant.error.message);
    } else {
      calls = byVapiAssistant.data ?? [];
    }
  }

  // 4) Response
  return NextResponse.json({
    ok: true,
    agent,
    calls,
    calls_warnings: warnings.length ? warnings : undefined,
  });
}

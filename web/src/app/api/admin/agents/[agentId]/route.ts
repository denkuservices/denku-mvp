import { NextRequest, NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth/basic";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";

type Ctx = { params: Promise<{ agentId: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getAgentId(request: NextRequest, ctx: Ctx) {
  // Primary: Next route param
  let agentId = "";
  try {
    const p = await ctx.params;
    agentId = (p?.agentId ?? "").trim();
  } catch {}

  // Fallback: parse from pathname (never includes query)
  if (!agentId) {
    const parts = request.nextUrl.pathname.split("/").filter(Boolean);
    agentId = (parts[parts.length - 1] ?? "").trim();
  }

  return agentId;
}

function jsonError(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, ...(details ? { details } : {}) }, { status });
}

export async function GET(request: NextRequest, ctx: Ctx) {
  // 1) Basic Auth guard
  if (!requireBasicAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin Area"' },
    });
  }

  const agentId = await getAgentId(request, ctx);
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  if (!agentId) return jsonError(400, "Missing agentId");
  if (!isUuid(agentId)) return jsonError(400, "Invalid agentId (expected UUID)", { agentId });

  // 2) Agent
  const { data: agent, error: aErr } = await supabaseAdmin
    .from("agents")
    .select(
      "id, org_id, name, language, voice, timezone, created_by, created_at, vapi_assistant_id, vapi_phone_number_id, vapi_provider, inbound_phone"
    )
    .eq("id", agentId)
    .single();

  if (aErr || !agent) {
    return jsonError(404, "Agent not found", aErr?.message);
  }

  // 3) Calls (last 7 days)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  let calls: any[] = [];
  const warnings: string[] = [];

  // A) calls by agent_id
  const byAgentId = await supabaseAdmin
    .from("calls")
    .select(
      "id, started_at, ended_at, duration_seconds, cost_usd, outcome, created_at, vapi_call_id, transcript, agent_id, vapi_assistant_id"
    )
    .eq("agent_id", agentId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);

  if (byAgentId.error) warnings.push(byAgentId.error.message);
  calls = byAgentId.data ?? [];

  // B) fallback: by vapi_assistant_id
  if (calls.length === 0 && agent.vapi_assistant_id) {
    const byVapiAssistant = await supabaseAdmin
      .from("calls")
      .select(
        "id, started_at, ended_at, duration_seconds, cost_usd, outcome, created_at, vapi_call_id, transcript, agent_id, vapi_assistant_id"
      )
      .eq("vapi_assistant_id", agent.vapi_assistant_id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    if (byVapiAssistant.error) warnings.push(byVapiAssistant.error.message);
    calls = byVapiAssistant.data ?? calls;
  }
  let vapiPhoneNumber: any = null;

  if (debug && agent.vapi_phone_number_id) {
    try {
      vapiPhoneNumber = await vapiFetch<any>(`/phone-number/${agent.vapi_phone_number_id}`, { method: "GET" });
    } catch (e: any) {
      vapiPhoneNumber = { error: String(e?.message ?? e) };
    }
  }
  
  // 4) Optional debug payload (does not affect lookup)
  const debugInfo = debug
    ? {
        agentId,
        pathname: request.nextUrl.pathname,
        search: request.nextUrl.search,
        hasAuthHeader: Boolean(request.headers.get("authorization")),
      }
    : undefined;

  return NextResponse.json({
    ok: true,
    agent,
    calls,
    calls_warnings: warnings.length ? warnings : undefined,
    debug: debugInfo,
    ...(debug ? { vapiPhoneNumber } : {}),

  });
}

type PatchBody = {
  name?: string;
  language?: string;
  voice?: string;
  timezone?: string;

  // UI settings (Vapi assistant)
  systemPrompt?: string;
  firstMessage?: string;
};

export async function PATCH(request: NextRequest, ctx: Ctx) {
  // 1) Basic Auth guard
  if (!requireBasicAuth(request)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin Area"' },
    });
  }

  const agentId = await getAgentId(request, ctx);
  if (!agentId) return jsonError(400, "Missing agentId");
  if (!isUuid(agentId)) return jsonError(400, "Invalid agentId (expected UUID)", { agentId });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  // 2) Load agent
  const { data: agent, error: aErr } = await supabaseAdmin
    .from("agents")
    .select(
      "id, org_id, name, language, voice, timezone, vapi_assistant_id, vapi_phone_number_id, vapi_provider, inbound_phone"
    )
    .eq("id", agentId)
    .single();

  if (aErr || !agent) return jsonError(404, "Agent not found", aErr?.message);

  // 3) Update Vapi assistant (if exists)
  // IMPORTANT: Vapi does NOT accept systemPrompt as top-level.
  // We push system prompt into model.messages[{role:'system',content:'...'}].
  if (agent.vapi_assistant_id) {
    const vapiPatch: any = {};

    if (typeof body.name === "string" && body.name.trim()) vapiPatch.name = body.name.trim();
    if (typeof body.firstMessage === "string" && body.firstMessage.trim())
      vapiPatch.firstMessage = body.firstMessage.trim();

    if (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) {
      vapiPatch.model = {
        // keep a sane default; adjust later if you expose model selection in UI
        provider: "openai",
        model: "gpt-4.1-mini",
        messages: [{ role: "system", content: body.systemPrompt.trim() }],
      };
    }

    // Voice mapping: your DB stores "alloy" etc.
    // Vapi voice object expects provider + voiceId (commonly "openai" + "alloy").
    if (typeof body.voice === "string" && body.voice.trim()) {
      vapiPatch.voice = { provider: "openai", voiceId: body.voice.trim() };
    }

    // Only call Vapi if we have something to change
    if (Object.keys(vapiPatch).length > 0) {
      try {
        await vapiFetch(`/assistant/${agent.vapi_assistant_id}`, {
          method: "PATCH",
          body: JSON.stringify(vapiPatch),
        });
      } catch (e: any) {
        return NextResponse.json(
          {
            ok: false,
            error: "Vapi assistant update failed",
            details: String(e?.message ?? e),
          },
          { status: 400 }
        );
      }
    }
  }

  // 4) Update Supabase agents row
  const update: any = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.language === "string" && body.language.trim()) update.language = body.language.trim();
  if (typeof body.voice === "string" && body.voice.trim()) update.voice = body.voice.trim();
  if (typeof body.timezone === "string" && body.timezone.trim()) update.timezone = body.timezone.trim();

  const { data: updated, error: uErr } = await supabaseAdmin
    .from("agents")
    .update(update)
    .eq("id", agentId)
    .select(
      "id, org_id, name, language, voice, timezone, created_by, created_at, vapi_assistant_id, vapi_phone_number_id, vapi_provider, inbound_phone"
    )
    .single();

  if (uErr || !updated) return jsonError(400, "Supabase agent update failed", uErr?.message);

  return NextResponse.json({ ok: true, agent: updated });
}

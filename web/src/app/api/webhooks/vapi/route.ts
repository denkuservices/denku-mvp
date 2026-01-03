import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -----------------------------
   Schema (esnek – Vapi payload değişebilir)
----------------------------- */
const VapiWebhookSchema = z
  .object({
    message: z.any(),
  })
  .passthrough();

/* -----------------------------
   Helpers
----------------------------- */
function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Cost extraction
 * ❗️Cost yoksa NULL döner (asla 0 yazmaz)
 */
function extractCost(body: any): number | null {
  const rawCost =
    body?.cost ??
    body?.message?.cost ??
    body?.message?.call?.cost ??
    body?.message?.summary_table?.cost ??
    body?.message?.call?.summary_table?.cost;

  if (rawCost === undefined || rawCost === null) return null;

  const parsed = parseFloat(String(rawCost));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPhones(msg: any) {
  const call = msg?.call;
  return {
    from_phone:
      msg?.customer?.number ??
      call?.customer?.number ??
      call?.from ??
      null,
    to_phone:
      msg?.phoneNumber?.number ??
      call?.phoneNumber?.number ??
      call?.to ??
      null,
  };
}

/* -----------------------------
   POST
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = body.message;
    const call = msg?.call;
    const eventType = msg?.type;

    /**
     * 🔑 TEK VE NET Call ID
     * Final eventlerde call yok, summary_table.id geliyor
     */
    const vapiCallId =
      call?.id ??
      msg?.summary_table?.id ??
      msg?.id ??
      body?.id ??
      null;

    console.log("[VAPI CALL ID RESOLVED]", {
      callId: call?.id,
      summaryId: msg?.summary_table?.id,
      msgId: msg?.id,
      final: vapiCallId,
    });

    if (!vapiCallId) {
      return NextResponse.json({ ok: true, ignored: "no_call_id" });
    }

    /* -----------------------------
       Agent / Org resolve
    ----------------------------- */
    const assistantId = call?.assistantId ?? msg?.assistantId ?? null;

    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("agents")
      .select("id, org_id")
      .eq("vapi_assistant_id", assistantId)
      .maybeSingle();

    if (agentErr || !agent) {
      console.warn("[VAPI] agent not found", { assistantId });
      return NextResponse.json({ ok: true, ignored: "agent_not_found" });
    }

    const { from_phone, to_phone } = extractPhones(msg);

    console.log("[WEBHOOK EVENT]", {
      eventType,
      vapiCallId,
    });

    /* =========================================================
       FINAL EVENT → UPDATE (cost_usd burada kesin yazılır)
       ========================================================= */
    if (eventType === "end-of-call-report") {
      const costUsd = extractCost(body);

      console.log("[FINAL COST DEBUG]", {
        vapiCallId,
        costUsd,
        raw: {
          top: body?.cost,
          msg: body?.message?.cost,
          summary: body?.message?.summary_table?.cost,
        },
      });

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("calls")
        .update({
          cost_usd: costUsd,
          outcome: "completed",
          ended_at:
            msg?.summary_table?.endedAt ??
            new Date().toISOString(),
          raw_payload: body,
        })
        .eq("vapi_call_id", vapiCallId)
        .select("id, vapi_call_id, cost_usd");

      console.log("[FINAL UPDATE RESULT]", {
        vapiCallId,
        affectedRows: updated?.length ?? 0,
        updated,
        error: updateErr?.message,
      });

      if (updateErr) {
        console.error("[VAPI] final update failed", updateErr);
        return NextResponse.json(
          { ok: false, error: "final_update_failed" },
          { status: 500 }
        );
      }

      if (!updated || updated.length === 0) {
        console.error("[CRITICAL] UPDATE matched 0 rows", {
          vapiCallId,
        });
      }

      return NextResponse.json({ ok: true });
    }

    /* =========================================================
       NON-FINAL EVENT → UPSERT (cost_usd YAZILMAZ)
       ========================================================= */
    const { error: upsertErr } = await supabaseAdmin
      .from("calls")
      .upsert(
        {
          vapi_call_id: vapiCallId,
          org_id: agent.org_id,
          agent_id: agent.id,
          direction:
            call?.type === "inboundPhoneCall" ? "inbound" : "outbound",
          from_phone,
          to_phone,
          started_at:
            call?.createdAt ??
            call?.startedAt ??
            new Date().toISOString(),
          raw_payload: body,
        },
        { onConflict: "vapi_call_id" }
      );

    if (upsertErr) {
      console.error("[VAPI] upsert failed", upsertErr);
      return NextResponse.json(
        { ok: false, error: "upsert_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[VAPI WEBHOOK ERROR]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/* -----------------------------
   GET (debug)
----------------------------- */
export async function GET() {
  return NextResponse.json({ ok: true });
}

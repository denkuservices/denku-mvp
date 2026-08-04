import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

/* -----------------------------
   Schema - En Esnek Hali
----------------------------- */
const VapiWebhookSchema = z.object({
  message: z.any(), // Hata veren record yerine any kullanarak esneklik sağladık
}).passthrough();

/* -----------------------------
   Helpers
----------------------------- */
function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Payload'daki maliyeti yakalayan en geniş kapsamlı fonksiyon
 * Returns null if cost not found (don't write 0)
 */
function extractCost(fullBody: any): number | null {
  // Vapi hiyerarşisinde maliyetin olabileceği tüm noktalar:
  const rawCost = 
    fullBody?.cost ??                               // 1. En üst seviye
    fullBody?.message?.cost ??                      // 2. Message seviyesi
    fullBody?.message?.call?.cost ??                // 3. Call nesnesi içi
    fullBody?.message?.summary_table?.cost ??       // 4. Özet tablosu
    fullBody?.message?.call?.summary_table?.cost;   // 5. Alternatif derinlik

  if (rawCost === undefined || rawCost === null) return null;
  
  const parsed = parseFloat(String(rawCost));
  return isNaN(parsed) ? null : parsed;
}

function extractPhones(msg: any) {
  const call = msg?.call;
  const from = msg?.customer?.number ?? call?.customer?.number ?? call?.from ?? null;
  const to = msg?.phoneNumber?.number ?? call?.phoneNumber?.number ?? call?.to ?? null;
  return { from_phone: from, to_phone: to };
}

/* -----------------------------
   POST Handler
----------------------------- */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    const parsed = VapiWebhookSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = rawBody.message;
    const call = msg?.call;
    const type = msg?.type;

    // 🔑 TEK ve DOĞRU Call ID çözümü
    const vapiCallId =
      call?.id ??
      msg?.summary_table?.id ??
      msg?.id ??
      rawBody?.id ??
      null;

    console.log("[VAPI CALL ID RESOLVED]", {
      fromCall: call?.id,
      fromSummary: msg?.summary_table?.id,
      fromMsg: msg?.id,
      final: vapiCallId,
    });

    if (!vapiCallId) {
      return NextResponse.json({ ok: true, message: "No Call ID" });
    }

    // Agent resolve (aynı kalsın)
    const assistantId = call?.assistantId ?? msg?.assistantId;
    const { data: agentData } = await supabaseAdmin
      .from("agents")
      .select("id, org_id")
      .or(`vapi_assistant_id.eq.${assistantId}`)
      .maybeSingle();

    if (!agentData) {
      return NextResponse.json({ ok: true, warning: "Agent not found" });
    }

    const { from_phone, to_phone } = extractPhones(msg);

    console.log("[WEBHOOK EVENT]", {
      type,
      vapiCallId,
      hasCall: !!call,
    });

    // =========================
    // FINAL EVENT
    // =========================
    if (type === "end-of-call-report") {
      const finalCost = extractCost(rawBody);

      console.log("[FINAL COST DEBUG]", {
        vapiCallId,
        finalCost,
        summaryCost: msg?.summary_table?.cost,
        messageCost: msg?.cost,
      });

      const { data, error } = await supabaseAdmin
        .from("calls")
        .update({
          cost_usd: finalCost, // NULL olabilir, 0 YAZMIYORUZ
          outcome: "completed",
          ended_at: msg?.summary_table?.endedAt ?? new Date().toISOString(),
          raw_payload: rawBody,
        })
        .eq("vapi_call_id", vapiCallId)
        .select("id, vapi_call_id, cost_usd");

      console.log("[FINAL UPDATE RESULT]", {
        vapiCallId,
        affectedRows: data?.length ?? 0,
        rows: data,
        error: error?.message,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        console.error("[CRITICAL] FINAL UPDATE MATCHED 0 ROWS", {
          vapiCallId,
        });
      }

      return NextResponse.json({ ok: true, stage: "final" });
    }

    // =========================
    // NON-FINAL EVENTS
    // =========================
    console.log("[NON-FINAL EVENT] UPSERT", {
      type,
      vapiCallId,
    });

    const { error: upsertErr } = await supabaseAdmin
      .from("calls")
      .upsert(
        {
          vapi_call_id: vapiCallId,
          org_id: agentData.org_id,
          agent_id: agentData.id,
          direction: call?.type === "inboundPhoneCall" ? "inbound" : "outbound",
          from_phone,
          to_phone,
          started_at: call?.createdAt ?? call?.startedAt ?? new Date().toISOString(),
          raw_payload: rawBody,
          // ⚠️ cost_usd YOK
        },
        { onConflict: "vapi_call_id" }
      );

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ ok: true, stage: "non-final" });

  } catch (err: any) {
    console.error("[Webhook Error]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

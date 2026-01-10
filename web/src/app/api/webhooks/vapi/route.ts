import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isWorkspacePaused } from "@/lib/workspace-status";
import { logAuditEvent } from "@/lib/audit/log";
import {
  acquireOrgConcurrencyLease,
  releaseOrgConcurrencyLease,
  releaseExpiredLeases,
} from "@/lib/concurrency/leases";

const VapiWebhookSchema = z
  .object({
    message: z.any(),
  })
  .passthrough();

/* -----------------------------
   Helpers
----------------------------- */
function asString(v: unknown) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return null;
  }
}

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function safeInt(v: unknown): number | null {
  const n =
    typeof v === "number" ? v :
    typeof v === "string" ? Number(v) :
    NaN;

  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n)); // istersen Math.floor da olur
}

function toIsoOrNull(v?: string | null) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  return digits.replace(/\D/g, "");
}

function compact<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Cost extraction
 * - cost yoksa null (0 yazma)
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

function extractCallId(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  // Vapi eventlerinde id farklı yerlerde gelebilir
  return (
    call?.id ??
    msg?.summary_table?.id ??
    msg?.callId ??
    msg?.id ??
    body?.callId ??
    body?.id ??
    null
  );
}

function extractStartedEnded(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  const startedAt =
    toIsoOrNull(call?.startedAt) ??
    toIsoOrNull(call?.createdAt) ??
    toIsoOrNull(msg?.startedAt) ??
    toIsoOrNull(msg?.summary_table?.createdAt) ??
    null;

  const endedAt =
    toIsoOrNull(call?.endedAt) ??
    toIsoOrNull(msg?.endedAt) ??
    toIsoOrNull(msg?.summary_table?.endedAt) ??
    null;

  return { startedAt, endedAt };
}

function extractPhones(body: any) {
  const msg = body?.message;
  const call = msg?.call;

  const from =
    normalizePhone(asString(msg?.customer?.number)) ??
    normalizePhone(asString(call?.customer?.number)) ??
    normalizePhone(asString(call?.from)) ??
    null;

  // bizim numaramız genelde phoneNumber.number veya call.phoneNumber.number
  const to =
    normalizePhone(asString(msg?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.phoneNumber?.number)) ??
    normalizePhone(asString(call?.to)) ??
    null;

  return { from_phone: from, to_phone: to };
}

function extractTranscript(body: any) {
  const msg = body?.message;
  const call = msg?.call;
  return (
    asString(call?.transcript) ??
    asString(msg?.transcript) ??
    asString(msg?.artifact?.transcript) ??
    null
  );
}

async function resolveAgentByVapi(body: any): Promise<{ agentId: string | null; orgId: string | null }> {
  const msg = body?.message;
  const call = msg?.call;

  const assistantId = call?.assistantId ?? msg?.assistantId ?? msg?.summary_table?.assistantId ?? null;
  const phoneNumberId = call?.phoneNumberId ?? msg?.phoneNumberId ?? null;

  const ors = [
    assistantId ? `vapi_assistant_id.eq.${assistantId}` : null,
    phoneNumberId ? `vapi_phone_number_id.eq.${phoneNumberId}` : null,
  ]
    .filter(Boolean)
    .join(",");

  if (!ors) return { agentId: null, orgId: null };

  const { data, error } = await supabaseAdmin
    .from("agents")
    .select("id, org_id")
    .or(ors)
    .maybeSingle();

  if (error || !data?.id) return { agentId: null, orgId: null };
  return { agentId: data.id, orgId: (data as any).org_id ?? null };
}

/**
 * lead resolve/create by phone (opsiyonel ama lead_id doldurmak için gerekli)
 * Eğer leads tablon yoksa bunu tamamen kaldırabilirsin.
 */
async function resolveLeadId(orgId: string, phone: string | null) {
  const p = normalizePhone(phone);
  if (!p) return null;

  const { data: existing, error: e1 } = await supabaseAdmin
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .eq("phone", p)
    .maybeSingle();

  if (!e1 && existing?.id) return existing.id as string;

  const { data: created, error: e2 } = await supabaseAdmin
    .from("leads")
    .insert({
      org_id: orgId,
      phone: p,
      name: null,
      email: null,
      source: "inbound_call",
      status: "new",
      notes: null,
    })
    .select("id")
    .single();

  if (e2) return null;
  return created?.id ?? null;
}

/* -----------------------------
   POST
----------------------------- */
export async function POST(req: NextRequest) {
  console.log("### VAPI ROUTE TOP HIT ###");
  
  const routeMarker = "### HIT ROUTE: /api/webhooks/vapi ###";
  const timestamp = new Date().toISOString();
  
  // TASK 1: Unmistakable server-side logging at route entry
  console.log(routeMarker, {
    timestamp,
    method: "POST",
    path: "/api/webhooks/vapi",
  });

  try {
    // Parse headers for debug logging
    const headersObj: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const body = await req.json();
    
    // TASK 2: Write to webhook_debug IMMEDIATELY at route entry (before any validation)
    // Use existing schema: source, headers, body
    let debugInsertSuccess = false;
    let debugInsertMethod = "none";
    
    try {
      // Try admin client first
      const { data: debugData, error: debugErr } = await supabaseAdmin
        .from("webhook_debug")
        .insert({
          source: "vapi_route_hit",
          headers: headersObj,
          body: body,
        })
        .select("id")
        .single();

      if (debugErr) {
        console.error("[WEBHOOK_DEBUG] Admin insert failed:", {
          error: debugErr,
          code: debugErr.code,
          message: debugErr.message,
          details: debugErr.details,
          hint: debugErr.hint,
        });
        throw debugErr; // Trigger fallback
      } else {
        debugInsertSuccess = true;
        debugInsertMethod = "admin";
        console.log("[WEBHOOK_DEBUG] Admin insert SUCCESS:", {
          debugId: debugData?.id,
          timestamp,
        });
      }
    } catch (adminErr) {
      console.error("[WEBHOOK_DEBUG] Admin insert exception, trying fallback:", adminErr);
      
      // Fallback: Try server client (but it may not have insert permissions due to RLS)
      // Still log the attempt for visibility
      try {
        const { createServerClient } = await import("@supabase/ssr");
        const { cookies } = await import("next/headers");
        const cookieStore = (await cookies()) as any;
        
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        
        if (url && anonKey) {
          const supabaseServer = createServerClient(url, anonKey, {
            cookies: {
              get(name: string) {
                return cookieStore.get(name)?.value;
              },
              set() {},
              remove() {},
            },
          });

          const { error: serverErr } = await supabaseServer
            .from("webhook_debug")
            .insert({
              source: "vapi_route_hit_fallback",
              headers: headersObj,
              body: body,
            });

          if (serverErr) {
            console.error("[WEBHOOK_DEBUG] Server client fallback also failed:", serverErr);
            debugInsertMethod = "both_failed";
          } else {
            debugInsertSuccess = true;
            debugInsertMethod = "server_fallback";
            console.log("[WEBHOOK_DEBUG] Server client fallback SUCCESS");
          }
        }
      } catch (fallbackErr) {
        console.error("[WEBHOOK_DEBUG] Fallback attempt exception:", fallbackErr);
        debugInsertMethod = "both_failed";
      }
    }

    const parsed = VapiWebhookSchema.safeParse(body);
    if (!parsed.success) {
      console.log("[WEBHOOK] Schema validation failed, returning 400");
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const msg = body.message;
    const call = msg?.call;
    const eventType = msg?.type ?? null;
    const status = asString(call?.status) ?? asString(msg?.status) ?? null;

    // Normalize vapi_call_id once at the top (after body parsing)
    const vapiCallId = asString(extractCallId(body));

    console.log("[WEBHOOK]", {
      eventType,
      status,
      vapiCallId,
      hasCall: !!call,
      debugInsertSuccess,
      debugInsertMethod,
    });

    // Continue processing even if vapiCallId is missing (for debug visibility)
    if (!vapiCallId) {
      console.log("[WEBHOOK] No vapi_call_id found, returning early");
      return NextResponse.json({ ok: true, ignored: "no_call_id" });
    }

    const { agentId, orgId } = await resolveAgentByVapi(body);
    if (!agentId || !orgId) {
      console.log("[WEBHOOK] Agent not found, returning early", { vapiCallId });
      return NextResponse.json({ ok: true, ignored: "agent_not_found" });
    }

    // CRITICAL: Check if workspace is paused - return 200 but do NOT process
    const isPaused = await isWorkspacePaused(orgId);
    if (isPaused) {
      // Log audit entry for ignored webhook
      try {
        await logAuditEvent({
          org_id: orgId,
          actor_user_id: null, // System action
          action: "workspace.paused.webhook_ignored",
          entity_type: "webhook",
          entity_id: orgId, // ALWAYS a UUID-safe identifier
          diff: {
            reason: { before: null, after: "workspace paused" },
            vapi_call_id: { before: null, after: vapiCallId ?? null },
          },
        });
        
      } catch (auditErr) {
        // Don't fail webhook if audit logging fails
        console.error("[WEBHOOK] Audit log failed:", auditErr);
      }

      console.log("[WEBHOOK] Workspace paused - ignoring webhook", { orgId, vapiCallId });
      return NextResponse.json({ ok: true, ignored: "workspace_paused" });
    }

    const { startedAt, endedAt } = extractStartedEnded(body);
    const { from_phone, to_phone } = extractPhones(body);

    const direction =
      (call?.type ?? msg?.summary_table?.type) === "inboundPhoneCall"
        ? "inbound"
        : (call?.type ?? msg?.summary_table?.type) === "outboundPhoneCall"
        ? "outbound"
        : "unknown";

    console.log("### BEFORE LEASE / DEBUG BLOCK ###");

    // PHASE 2: HARD INSTRUMENTATION - Write debug row on EVERY request (using service role)
    let debugRowId: string | null = null;
    try {
      const { data: debugInsert, error: debugErr } = await supabaseAdmin
        .from("webhook_debug")
        .insert({
          event_type: eventType,
          vapi_call_id: vapiCallId,
          raw_payload: body,
          org_id: orgId,
          agent_id: agentId,
          direction,
          started_at: startedAt,
          ended_at: endedAt,
        })
        .select("id")
        .single();

      if (debugErr) {
        console.error("[WEBHOOK] CRITICAL: Failed to write webhook_debug row:", {
          error: debugErr,
          vapiCallId,
          eventType,
        });
        // DO NOT swallow - this is critical instrumentation
      } else {
        debugRowId = debugInsert?.id ?? null;
        console.log("[WEBHOOK] Debug row written", { debugRowId, vapiCallId, eventType });
      }
    } catch (debugException) {
      console.error("[WEBHOOK] CRITICAL: Exception writing webhook_debug:", {
        error: debugException,
        vapiCallId,
      });
      // DO NOT swallow
    }

    // PART C: CONCURRENCY ENFORCEMENT (ORG-LEVEL)
    // Clean up expired leases on each webhook (best-effort, log failures)
    try {
      const expiredCount = await releaseExpiredLeases();
      if (expiredCount > 0) {
        console.log(`[WEBHOOK] Cleaned up ${expiredCount} expired lease(s)`, { orgId });
      }
    } catch (expiredErr) {
      console.error("[WEBHOOK] Failed to release expired leases (non-fatal):", {
        orgId,
        error: expiredErr,
      });
    }

    // Check if call already exists in database (to determine if this is a NEW call)
    let existingCall: { id: string; org_id: string; agent_id: string | null; ended_at: string | null } | null = null;
    try {
      const { data: existing } = await supabaseAdmin
        .from("calls")
        .select("id, org_id, agent_id, ended_at")
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle();

      existingCall = existing;
    } catch (existingErr) {
      console.error("[WEBHOOK] Failed to check existing call:", existingErr);
      // Continue anyway
    }

    const isNewCall = !existingCall;
    const wasEnded = existingCall?.ended_at != null;
    const isNowEnded = endedAt != null;
    const callJustEnded = !wasEnded && isNowEnded;

    const vapi_assistant_id =
      call?.assistantId ?? msg?.assistantId ?? msg?.summary_table?.assistantId ?? null;

    const vapi_phone_number_id =
      call?.phoneNumberId ?? msg?.phoneNumberId ?? null;

    // Non-final'de de lead'i bağlayabiliriz (inbound için caller phone)
    const leadId = direction === "inbound" ? await resolveLeadId(orgId, from_phone) : null;

    // duration: final eventte daha doğru (summary_table.minutes vs / call.durationSeconds)
    const durationSeconds =
      safeNumber(call?.durationSeconds) ??
      safeNumber(msg?.durationSeconds) ??
      null;

    // 1) Her eventte row'u var etmek için UPSERT (cost_usd yazmıyoruz)
    const baseUpsert = {
      vapi_call_id: vapiCallId,
      org_id: orgId,
      agent_id: agentId,
      direction,
      from_phone,
      to_phone,
      started_at: startedAt,
      ended_at: endedAt ?? undefined, // finalde update edeceğiz
      duration_seconds: safeInt(call?.durationSeconds ?? msg?.durationSeconds),
      vapi_assistant_id,
      vapi_phone_number_id,
      lead_id: leadId ?? undefined,
      raw_payload: body,
      outcome: asString(call?.status) ?? asString(msg?.status) ?? undefined,
      transcript: undefined, // transcript'i final eventte daha iyi yaz
    };

    // TASK 3: Unique marker log RIGHT BEFORE calls table write
    console.log("### CALLS TABLE WRITE: /api/webhooks/vapi POST handler ###", {
      timestamp: new Date().toISOString(),
      file: "web/src/app/api/webhooks/vapi/route.ts",
      function: "POST handler",
      operation: "upsert",
      org_id: orgId,
      agent_id: agentId,
      vapi_call_id: vapiCallId,
      direction,
      started_at: startedAt,
      ended_at: endedAt,
    });

    console.log("### BEFORE CALL UPSERT ###", { eventType, status, vapiCallId });

    const { data: upsertedCall, error: upsertErr } = await supabaseAdmin
      .from("calls")
      .upsert(compact(baseUpsert), { onConflict: "vapi_call_id" })
      .select("id, org_id, agent_id, ended_at")
      .single();

    console.log("### AFTER CALL UPSERT ###");

    if (upsertErr) {
      console.error("### CALLS TABLE WRITE FAILED ###", {
        timestamp: new Date().toISOString(),
        file: "web/src/app/api/webhooks/vapi/route.ts",
        error: upsertErr,
        org_id: orgId,
        agent_id: agentId,
        vapi_call_id: vapiCallId,
      });
      
      // Update debug row with error
      if (debugRowId) {
        try {
          await supabaseAdmin
            .from("webhook_debug")
            .update({ error_message: `upsert_failed: ${upsertErr.message}` })
            .eq("id", debugRowId);
        } catch {
          // Ignore debug update failures
        }
      }
      
      return NextResponse.json({ ok: false, error: "upsert_failed" }, { status: 500 });
    }

    // PHASE 4: Use org_id and agent_id from the ACTUAL calls row (more reliable)
    const actualOrgId = upsertedCall?.org_id ?? orgId;
    const actualAgentId = upsertedCall?.agent_id ?? agentId;
    const actualEndedAt = upsertedCall?.ended_at;

    // PHASE 4: Acquire lease on NEW call (when call row is created for first time)
    if (isNewCall && startedAt && !actualEndedAt) {
      console.log("[WEBHOOK] NEW CALL DETECTED - acquiring lease", {
        vapiCallId,
        actualOrgId,
        actualAgentId,
        startedAt,
      });

      let leaseAcquired = false;
      let leaseError: string | null = null;

      try {
        const leaseResult = await acquireOrgConcurrencyLease({
          orgId: actualOrgId,
          agentId: actualAgentId,
          vapiCallId: vapiCallId,
          ttlMinutes: 15,
        });

        if (!leaseResult.ok) {
          leaseError = `${leaseResult.reason}: ${leaseResult.error ?? "unknown"}`;
          console.warn("[WEBHOOK] Lease acquire failed for new call:", {
            vapiCallId,
            actualOrgId,
            actualAgentId,
            reason: leaseResult.reason,
            error: leaseResult.error,
          });

          // Write audit log for failure
          try {
            await logAuditEvent({
              org_id: actualOrgId,
              actor_user_id: null,
              action: leaseResult.reason === "limit_reached" ? "concurrency_limit_reached" : "lease_acquire_failed",
              entity_type: "call",
              entity_id: vapiCallId ?? actualOrgId,
              diff: {
                reason: { before: null, after: leaseResult.reason },
                vapi_call_id: { before: null, after: vapiCallId },
                direction: { before: null, after: direction },
                error: { before: null, after: leaseResult.error ?? null },
              },
            });
          } catch (auditErr) {
            console.error("[WEBHOOK] Audit log failed:", auditErr);
          }

          // Update debug row
          if (debugRowId) {
            try {
              await supabaseAdmin
                .from("webhook_debug")
                .update({
                  lease_acquired: false,
                  error_message: leaseError,
                })
                .eq("id", debugRowId);
            } catch {
              // Ignore debug update failures
            }
          }

          // Reject call if limit reached or org inactive
          if (leaseResult.reason === "limit_reached" || leaseResult.reason === "org_inactive") {
            return NextResponse.json({
              ok: true,
              rejected: true,
              reason: leaseResult.reason,
            });
          }
        } else {
          leaseAcquired = true;
          console.log("[WEBHOOK] Lease acquired successfully for new call", {
            vapiCallId,
            actualOrgId,
            actualAgentId,
          });

          // Update debug row
          if (debugRowId) {
            try {
              await supabaseAdmin
                .from("webhook_debug")
                .update({ lease_acquired: true })
                .eq("id", debugRowId);
            } catch {
              // Ignore debug update failures
            }
          }
        }
      } catch (leaseException) {
        leaseError = leaseException instanceof Error ? leaseException.message : String(leaseException);
        console.error("[WEBHOOK] Exception during lease acquisition:", {
          vapiCallId,
          actualOrgId,
          actualAgentId,
          error: leaseException,
        });

        // Write audit log for exception
        try {
          await logAuditEvent({
            org_id: actualOrgId,
            actor_user_id: null,
            action: "lease_acquire_failed",
            entity_type: "call",
            entity_id: vapiCallId ?? actualOrgId,
            diff: {
              reason: { before: null, after: `Exception: ${leaseError}` },
              vapi_call_id: { before: null, after: vapiCallId },
              direction: { before: null, after: direction },
            },
          });
        } catch (auditErr) {
          console.error("[WEBHOOK] Audit log failed:", auditErr);
        }

        // Update debug row
        if (debugRowId) {
          try {
            await supabaseAdmin
              .from("webhook_debug")
              .update({
                lease_acquired: false,
                error_message: leaseError,
              })
              .eq("id", debugRowId);
          } catch {
            // Ignore debug update failures
          }
        }

        // Reject call on exception
        return NextResponse.json({
          ok: true,
          rejected: true,
          reason: "lease_acquire_failed",
          error: leaseError,
        });
      }
    }

    console.log("### AFTER LEASE / DEBUG BLOCK ###");

    // PHASE 4: Release lease when call JUST ended (idempotent)
    // Release on any event where call transitions from not-ended to ended
    let leaseReleased = false;
    let releaseError: string | null = null;

    if (callJustEnded || (isNowEnded && !wasEnded)) {
      console.log("[WEBHOOK] CALL JUST ENDED - releasing lease", {
        vapiCallId,
        actualOrgId,
        actualAgentId,
        wasEnded,
        isNowEnded,
        actualEndedAt,
        endedAt,
      });

      try {
        await releaseOrgConcurrencyLease({
          orgId: actualOrgId,
          vapiCallId: vapiCallId,
        });
        leaseReleased = true;
        console.log("[WEBHOOK] Lease released successfully (call ended)", {
          vapiCallId,
          actualOrgId,
          actualAgentId,
        });

        // Update debug row
        if (debugRowId) {
          try {
            await supabaseAdmin
              .from("webhook_debug")
              .update({ lease_released: true })
              .eq("id", debugRowId);
          } catch {
            // Ignore debug update failures
          }
        }
      } catch (releaseErr) {
        releaseError = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
        console.error("[WEBHOOK] Failed to release lease on call end:", {
          actualOrgId,
          actualAgentId,
          vapiCallId,
          direction,
          error: releaseErr,
        });

        // Write audit log for release failure
        try {
          await logAuditEvent({
            org_id: actualOrgId,
            actor_user_id: null,
            action: "lease_release_failed",
            entity_type: "call",
            entity_id: vapiCallId ?? actualOrgId,
            diff: {
              reason: { before: null, after: releaseError },
              vapi_call_id: { before: null, after: vapiCallId },
              direction: { before: null, after: direction },
            },
          });
        } catch (auditErr) {
          console.error("[WEBHOOK] Audit log failed for lease release error:", auditErr);
        }

        // Update debug row
        if (debugRowId) {
          try {
            await supabaseAdmin
              .from("webhook_debug")
              .update({
                lease_released: false,
                error_message: releaseError,
              })
              .eq("id", debugRowId);
          } catch {
            // Ignore debug update failures
          }
        }

        // Don't fail webhook - release is cleanup, but log for visibility
      }
    }

    // 2) Final event → UPDATE ile kesin final alanları yaz
    const isFinalEvent =
      eventType === "end-of-call-report" ||
      (eventType === "status-update" && status === "ended");

    if (isFinalEvent) {
      const costUsd = extractCost(body);
      const transcript = extractTranscript(body);

      // final duration: call.durationSeconds yoksa summary_table.minutes * 60
      // Always round to integer for duration_seconds column
      const minutes = safeNumber(msg?.summary_table?.minutes);
      const finalDuration = safeInt(
        durationSeconds ?? (minutes != null ? minutes * 60 : null)
      );

      const finalEndedAt = endedAt ?? toIsoOrNull(msg?.summary_table?.endedAt) ?? new Date().toISOString();

      // Auto-link to lead if lead_id is null: resolve by org_id + from_phone
      let finalLeadId = leadId;
      if (!finalLeadId && from_phone) {
        finalLeadId = await resolveLeadId(orgId, from_phone);
      }

      // Always update: ended_at, outcome, duration_seconds
      // Only update cost_usd if valid (do NOT overwrite with null or 0)
      // Only update transcript if present (do not wipe existing transcript)
      const finalUpdate = compact({
        ended_at: finalEndedAt,
        outcome: "completed",
        duration_seconds: finalDuration ?? undefined,
        cost_usd: costUsd != null ? costUsd : undefined,
        transcript: transcript ?? undefined,
        vapi_assistant_id,
        vapi_phone_number_id,
        lead_id: finalLeadId ?? undefined,
        raw_payload: body,
      });

      // TASK 3: Unique marker log RIGHT BEFORE calls table UPDATE (final event)
      console.log("### CALLS TABLE UPDATE: /api/webhooks/vapi POST handler (final event) ###", {
        timestamp: new Date().toISOString(),
        file: "web/src/app/api/webhooks/vapi/route.ts",
        function: "POST handler (final event)",
        operation: "update",
        vapi_call_id: vapiCallId,
        actual_org_id: actualOrgId,
        actual_agent_id: actualAgentId,
        final_ended_at: finalEndedAt,
      });

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("calls")
        .update(finalUpdate)
        .eq("vapi_call_id", vapiCallId)
        .select("id, vapi_call_id, cost_usd, duration_seconds, transcript, lead_id, vapi_assistant_id, vapi_phone_number_id");

      console.log("[FINAL UPDATE RESULT]", {
        vapiCallId,
        affectedRows: updated?.length ?? 0,
        costUsd,
        finalDuration,
        hasTranscript: !!transcript,
      });

      if (updateErr) {
        console.error("### CALLS TABLE UPDATE FAILED ###", {
          timestamp: new Date().toISOString(),
          file: "web/src/app/api/webhooks/vapi/route.ts",
          error: updateErr,
          vapi_call_id: vapiCallId,
        });
        return NextResponse.json({ ok: false, error: "final_update_failed" }, { status: 500 });
      }

      console.log("### CALLS TABLE UPDATE SUCCESS ###", {
        timestamp: new Date().toISOString(),
        vapi_call_id: vapiCallId,
        affected_rows: updated?.length ?? 0,
      });

      // PHASE 4: Ensure lease is released after final update (safety check)
      // This handles cases where ended_at might not have been set in earlier events
      if (finalEndedAt && !leaseReleased) {
        console.log("[WEBHOOK] Final event - ensuring lease is released", {
          vapiCallId,
          actualOrgId,
          actualAgentId,
          finalEndedAt,
        });

        try {
          await releaseOrgConcurrencyLease({
            orgId: actualOrgId,
            vapiCallId: vapiCallId,
          });
          console.log("[WEBHOOK] Lease released on final event", {
            vapiCallId,
            actualOrgId,
          });

          // Update debug row
          if (debugRowId) {
            try {
              await supabaseAdmin
                .from("webhook_debug")
                .update({ lease_released: true })
                .eq("id", debugRowId);
            } catch {
              // Ignore debug update failures
            }
          }
        } catch (finalReleaseErr) {
          console.error("[WEBHOOK] Failed to release lease on final event:", {
            vapiCallId,
            actualOrgId,
            error: finalReleaseErr,
          });
          // Don't fail - already logged
        }
      }
    }

    console.log("### BEFORE RESPONSE RETURN ###");

    // TASK 5: Add response headers with diagnostic info
    const responseHeaders = new Headers();
    responseHeaders.set("X-Webhook-Debug-Insert", debugInsertSuccess ? "success" : "failed");
    responseHeaders.set("X-Webhook-Debug-Method", debugInsertMethod);
    responseHeaders.set("X-Webhook-Event-Type", eventType ?? "unknown");
    responseHeaders.set("X-Webhook-Vapi-Call-Id", vapiCallId ?? "none");

    return NextResponse.json(
      { 
        ok: true,
        _debug: {
          debugInsertSuccess,
          debugInsertMethod,
          eventType,
          vapiCallId,
        },
      },
      { headers: responseHeaders }
    );
  } catch (err: any) {
    console.error("### WEBHOOK ROUTE EXCEPTION ###", {
      timestamp: new Date().toISOString(),
      route: "/api/webhooks/vapi",
      error: err,
      stack: err?.stack,
    });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Abuse control constants
const WEBCALL_RATE_LIMIT_MAX_STARTS = 10;
const WEBCALL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

const WebCallEventSchema = z.object({
  call_id: z.string().uuid(), // Our internal UUID (used across platform/tools)
  vapi_call_id: z.string().min(1), // Real Vapi call ID (e.g., "019bb...") - required
  event: z.enum(["started", "ended"]),
  ts: z.number(),
  meta: z.object({ channel: z.string().optional() }).optional(),
  duration_seconds: z.number().optional(),
  cost_usd: z.number().optional(), // Optional cost from client (Vapi SDK)
});

/**
 * Check rate limit for WebCall start events per org_id using audit_log table.
 * Returns { allowed: boolean, count: number }
 */
async function checkWebCallRateLimit(orgId: string, callId: string): Promise<{ allowed: boolean; count: number }> {
  try {
    // 1) Insert audit_log row representing this start attempt
    const auditInsertResult = await supabaseAdmin
      .from("audit_log")
      .insert({
        org_id: orgId,
        actor_user_id: null, // System action
        action: "[ABUSE][WEB_START]",
        entity_type: "webcall",
        entity_id: callId,
      })
      .select("id")
      .single();
    
    if (auditInsertResult.error) {
      // Audit insert failed - default to allowing but log it
      try {
        console.info(JSON.stringify({
          tag: "[ABUSE][AUDIT_WRITE_FAILED]",
          ts: Date.now(),
          org_id: orgId,
          call_id: callId,
          error: auditInsertResult.error.message,
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      // Fail open: allow the call
      return { allowed: true, count: 0 };
    }
    
    // 2) Query audit_log count for this org_id for the last 10 minutes with same action
    const windowStart = new Date(Date.now() - WEBCALL_RATE_LIMIT_WINDOW_MS).toISOString();
    
    const { count, error } = await supabaseAdmin
      .from("audit_log")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("action", "[ABUSE][WEB_START]")
      .gte("created_at", windowStart);
    
    if (error) {
      console.warn("[ABUSE][RATE_LIMIT] Failed to query audit_log count:", { orgId, error: error.message });
      // On error, allow the request (fail open) but log it
      return { allowed: true, count: 0 };
    }
    
    const currentCount = count ?? 0;
    const allowed = currentCount <= WEBCALL_RATE_LIMIT_MAX_STARTS; // <= because we just inserted one
    
    return { allowed, count: currentCount };
  } catch (err) {
    console.warn("[ABUSE][RATE_LIMIT] Exception checking rate limit:", { orgId, error: err });
    // Fail open on exception
    return { allowed: true, count: 0 };
  }
}

/**
 * Extract cost from payload (for WebCall, cost may come from client, Vapi payload, or be unknown).
 * Priority: CLIENT (request body cost_usd) > PAYLOAD (nested cost fields) > UNKNOWN (0)
 * Returns { cost_usd: number, cost_status: string, cost_source: string }
 * Note: cost_usd is NEVER null - always returns 0 if not found.
 */
function extractWebCallCost(payload: any): { cost_usd: number; cost_status: string; cost_source: string } {
  // Priority 1: CLIENT - cost_usd from request body (frontend provides from Vapi SDK)
  if (payload?.cost_usd !== undefined && payload?.cost_usd !== null) {
    const parsed = parseFloat(String(payload.cost_usd));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { cost_usd: parsed, cost_status: "KNOWN", cost_source: "CLIENT" };
    }
  }
  
  // Priority 2: PAYLOAD - try to extract cost from various payload locations (similar to Vapi webhook)
  const rawCost =
    payload?.cost ??
    payload?.message?.cost ??
    payload?.message?.call?.cost ??
    payload?.message?.summary_table?.cost ??
    payload?.message?.call?.summary_table?.cost;
  
  if (rawCost !== undefined && rawCost !== null) {
    const parsed = parseFloat(String(rawCost));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { cost_usd: parsed, cost_status: "KNOWN", cost_source: "PAYLOAD" };
    }
  }
  
  // Priority 3: UNKNOWN - no cost available, set to 0
  return { cost_usd: 0, cost_status: "UNKNOWN", cost_source: "WEB_CALL_NO_METER" };
}

/**
 * Derive org_id from authenticated session context.
 * Returns { org_id: string | null, error: string | null }
 */
async function deriveOrgIdFromSession(): Promise<{ org_id: string | null; error: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: auth, error: authError } = await supabase.auth.getUser();
    
    if (authError || !auth?.user) {
      return { org_id: null, error: "UNAUTHORIZED" };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", auth.user.id)
      .maybeSingle<{ org_id: string | null }>();

    if (profileError || !profile?.org_id) {
      return { org_id: null, error: "ORG_NOT_FOUND" };
    }

    return { org_id: profile.org_id, error: null };
  } catch (err) {
    return { org_id: null, error: "SESSION_ERROR" };
  }
}

/**
 * WebCall Event Bridge
 * 
 * Receives lifecycle events from WebCall UI and persists them to the calls table.
 * For WebCall, we use the real Vapi call ID (e.g., "019bb...") from the SDK.
 * We never create rows with vapi_call_id="webcall:<uuid>" patterns.
 */
export async function POST(req: NextRequest) {
  process.stdout.write("[WEBCALL_EVENT_HIT]\n");
  
  // Read headers before auth
  const headers = req.headers;
  process.stdout.write("[WEBCALL_EVENT_HEADERS]\n");
  
  try {
    // Parse and validate request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_JSON" } },
        { status: 200 }
      );
    }

    const parseResult = WebCallEventSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_FAILED", details: parseResult.error.issues } },
        { status: 200 }
      );
    }

    const { call_id, vapi_call_id, event, ts, meta, duration_seconds } = parseResult.data;
    
    // Derive org_id from session (needed for logging)
    const { org_id, error: orgError } = await deriveOrgIdFromSession();
    if (orgError || !org_id) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", recoverable: false } },
        { status: 200 }
      );
    }

    // CRITICAL: Require real Vapi call ID - never accept "webcall:<uuid>" patterns
    // This prevents legacy rows with vapi_call_id="webcall:..." from being created
    if (!vapi_call_id || typeof vapi_call_id !== 'string' || vapi_call_id.trim() === '' || vapi_call_id.startsWith('webcall:')) {
      try {
        console.info(JSON.stringify({
          tag: "[WEBCALL][MISSING_VAPI_CALL_ID]",
          ts: Date.now(),
          call_id,
          org_id,
          event,
          vapi_call_id: vapi_call_id || null,
          reason: vapi_call_id?.startsWith('webcall:') ? "LEGACY_PATTERN_REJECTED" : "MISSING_OR_EMPTY",
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      
      return NextResponse.json(
        { ok: false, error: { code: "MISSING_VAPI_CALL_ID", recoverable: false } },
        { status: 200 }
      );
    }

    // Use the real Vapi call ID (e.g., "019bb...") - never "webcall:<uuid>"
    const vapiCallId = vapi_call_id.trim();
    const startedAt = new Date(ts).toISOString();

    if (event === "started") {
      // A) Rate limit check for WebCall start events (using audit_log)
      const rateLimitCheck = await checkWebCallRateLimit(org_id, call_id);
      
      if (!rateLimitCheck.allowed) {
        // Rate limit exceeded - do NOT create/upsert the call
        try {
          console.info(JSON.stringify({
            tag: "[ABUSE][RATE_LIMIT]",
            ts: Date.now(),
            org_id: org_id,
            call_id: call_id,
            count: rateLimitCheck.count,
          }));
        } catch (logErr) {
          // Never throw from logging
        }
        
        return NextResponse.json(
          { 
            ok: false, 
            error: { 
              code: "RATE_LIMITED_10_PER_10M", 
              recoverable: false,
            },
            action: {
              type: "END_CALL",
              reason: "RATE_LIMIT",
            },
          },
          { status: 200 }
        );
      }
      
      // Rate limit OK - emit log
      try {
        console.info(JSON.stringify({
          tag: "[ABUSE][RATE_LIMIT_OK]",
          ts: Date.now(),
          org_id: org_id,
          call_id: call_id,
          count: rateLimitCheck.count,
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      
      // Extract cost if available
      const costData = extractWebCallCost(body);
      
      // Upsert call row using our internal call_id (id) and real Vapi call ID (vapi_call_id)
      // This ensures webcall/event and vapi webhook update the SAME row
      const upsertPayload: Record<string, any> = {
        id: call_id, // Our internal UUID (used across platform/tools)
        vapi_call_id: vapiCallId, // Real Vapi call ID (e.g., "019bb...")
        org_id: org_id,
        call_type: "webcall",
        direction: "inbound",
        started_at: startedAt,
        raw_payload: { 
          source: "webcall_event", 
          meta, 
          ts,
          cost_status: costData.cost_status,
          cost_source: costData.cost_source,
        },
      };
      
      // Always set cost_usd (deterministic - never null)
      // extractWebCallCost always returns a number (0 if not found)
      upsertPayload.cost_usd = costData.cost_usd;
      
      // Upsert by vapi_call_id (real Vapi ID) to unify with vapi webhook
      const { data: result, error: upsertErr } = await supabaseAdmin
        .from("calls")
        .upsert(upsertPayload, { onConflict: "vapi_call_id" })
        .select("id, org_id")
        .single();

      if (upsertErr) {
        console.warn("[WEBCALL][EVENT] Failed to upsert call on started:", {
          call_id,
          vapi_call_id: vapiCallId,
          error: upsertErr.message,
        });
        return NextResponse.json(
          { ok: false, error: { code: "DB_ERROR", details: upsertErr.message } },
          { status: 200 }
        );
      }

      // Log cost status
      try {
        console.info(JSON.stringify({
          tag: "[COST][STATUS]",
          ts: Date.now(),
          call_id: result.id,
          status: costData.cost_status,
          cost_usd: costData.cost_usd,
        }));
      } catch (logErr) {
        // Never throw from logging
      }

      // Canonical event: CALL_START (only when auth succeeds)
      console.info(JSON.stringify({
        tag: "[CALL_START]",
        ts: Date.now(),
        call_id: result.id,
        org_id: result.org_id ?? null,
        source: "webcall",
        event: "started",
        vapi_call_id: vapiCallId,
      }));

      return NextResponse.json({ 
        ok: true, 
        call_id: result.id,
        debug: { event: "started", call_id: result.id },
      });
    }

    if (event === "ended") {
      // Fetch existing call by (org_id + vapi_call_id) for deterministic correlation
      // This ensures we update the same row that vapi webhook might have created
      const { data: existingCallData, error: fetchErr } = await supabaseAdmin
        .from("calls")
        .select("id, org_id, agent_id, started_at, transcript, intent, intent_confidence, vapi_call_id")
        .eq("vapi_call_id", vapiCallId)
        .eq("org_id", org_id)
        .maybeSingle<{
          id: string;
          org_id: string | null;
          agent_id: string | null;
          started_at: string | null;
          transcript: string | null;
          intent: string | null;
          intent_confidence: number | null;
          vapi_call_id: string;
        }>();

      // If call doesn't exist, create a minimal stub first (idempotent)
      let callId: string;
      let existingCall = existingCallData;

      if (!existingCall) {
        // Create minimal call stub with our internal call_id and real Vapi call ID
        const stubPayload: Record<string, any> = {
          id: call_id, // Our internal UUID
          vapi_call_id: vapiCallId, // Real Vapi call ID
          org_id: org_id,
          call_type: "webcall",
          direction: "inbound",
          started_at: startedAt,
          raw_payload: { source: "webcall_event", meta, ts, event: "ended_stub" },
        };

        const { data: stubResult, error: stubErr } = await supabaseAdmin
          .from("calls")
          .upsert(stubPayload, { onConflict: "vapi_call_id" })
          .select("id")
          .single();

        if (stubErr || !stubResult) {
          console.warn("[WEBCALL][EVENT] Failed to create stub on ended:", {
            call_id,
            vapi_call_id: vapiCallId,
            error: stubErr?.message,
          });
          return NextResponse.json(
            { ok: false, error: { code: "DB_ERROR", details: stubErr?.message } },
            { status: 200 }
          );
        }

        callId = stubResult.id;
        console.info("[WEBCALL][EVENT][STUB_CREATED]", { call_id: callId, vapi_call_id: vapiCallId });

        // Fetch the stub to get all fields
        const { data: fetchedStub } = await supabaseAdmin
          .from("calls")
          .select("id, org_id, agent_id, started_at, transcript, intent, intent_confidence, vapi_call_id")
          .eq("id", callId)
          .maybeSingle<{
            id: string;
            org_id: string | null;
            agent_id: string | null;
            started_at: string | null;
            transcript: string | null;
            intent: string | null;
            intent_confidence: number | null;
            vapi_call_id: string;
          }>();

        existingCall = fetchedStub;
      } else {
        callId = existingCall.id;
      }

      if (!existingCall) {
        // Should not happen after stub creation, but handle gracefully
        return NextResponse.json(
          { ok: false, error: { code: "CALL_NOT_FOUND" } },
          { status: 200 }
        );
      }

      // Extract cost early (before finalization) to ensure it's available
      const costData = extractWebCallCost(body);
      
      // Update call with ended_at, duration_seconds, and cost_usd in a single update
      // This ensures cost_usd is never null after event="ended"
      const initialUpdatePayload: Record<string, any> = {
        ended_at: startedAt,
        cost_usd: costData.cost_usd, // Always set (never null)
      };

      if (duration_seconds !== undefined) {
        initialUpdatePayload.duration_seconds = duration_seconds;
      }

      // Update by (org_id + vapi_call_id) for deterministic correlation with vapi webhook
      const { error: updateErr } = await supabaseAdmin
        .from("calls")
        .update(initialUpdatePayload)
        .eq("vapi_call_id", vapiCallId)
        .eq("org_id", org_id);

      if (updateErr) {
        console.warn("[WEBCALL][EVENT] Failed to update call on ended:", {
          call_id: callId,
          error: updateErr.message,
        });
        return NextResponse.json(
          { ok: false, error: { code: "DB_ERROR", details: updateErr.message } },
          { status: 200 }
        );
      }

      // Run finalization logic (completion_state, invariant enforcement, duration observation)
      try {
        const finalDuration = duration_seconds ?? 
          (existingCall.started_at 
            ? Math.round((new Date(startedAt).getTime() - new Date(existingCall.started_at).getTime()) / 1000)
            : null);

        // A) Duration observation (OBSERVE-FIRST mode: no enforcement)
        const DURATION_OBSERVATION_THRESHOLD = 480; // 8 minutes
        let durationObserved = false;
        if (finalDuration !== null && finalDuration >= DURATION_OBSERVATION_THRESHOLD) {
          durationObserved = true;
          try {
            console.info(JSON.stringify({
              tag: "[ABUSE][DURATION_OBSERVED]",
              ts: Date.now(),
              org_id: existingCall.org_id ?? null,
              call_id: callId,
              duration_seconds: finalDuration,
            }));
          } catch (logErr) {
            // Never throw from logging
          }
        }

        // Check for tickets and appointments
        const { data: ticket } = await supabaseAdmin
          .from("tickets")
          .select("id")
          .eq("call_id", callId)
          .maybeSingle();

        const { data: appointment } = await supabaseAdmin
          .from("appointments")
          .select("id")
          .eq("call_id", callId)
          .maybeSingle();

        const ticketCreated = !!ticket;
        const appointmentCreated = !!appointment;

        // Simple completion_state logic for web calls (unchanged - no duration-based enforcement)
        let completionState: "abandoned" | "partial" | "completed" = "abandoned";
        
        // Normal completion logic (duration observation does NOT affect completion_state)
        if (finalDuration !== null && finalDuration > 8) {
          if (ticketCreated || appointmentCreated) {
            completionState = "completed";
          } else if (finalDuration >= 15) {
            completionState = "partial";
          }
        }

        // Invariant enforcement: partial requires artifact
        if (completionState === "partial" && !ticketCreated && !appointmentCreated) {
          console.info(JSON.stringify({
            tag: "[CALL_COMPLETED][INVARIANT_CORRECTION]",
            ts: Date.now(),
            call_id: callId,
            org_id: existingCall.org_id ?? null,
            from: "partial",
            to: "abandoned",
            reason: "NO_ARTIFACT",
          }));
          completionState = "abandoned";
        }

        // B) Cost skeleton (deterministic, required)
        // Note: costData already extracted above, but ensure it's set correctly
        // costData.cost_usd is guaranteed to be a number (never null) from extractWebCallCost
        const finalCostUsd = costData.cost_usd;
        
        // Fetch current call to deep-merge raw_payload.meta
        const { data: currentCall } = await supabaseAdmin
          .from("calls")
          .select("raw_payload")
          .eq("vapi_call_id", vapiCallId)
          .eq("org_id", existingCall.org_id ?? org_id)
          .maybeSingle<{ raw_payload: any }>();
        
        // Deep-merge raw_payload.meta (preserve existing fields like channel)
        const existingRawPayload = currentCall?.raw_payload || {};
        const existingMeta = existingRawPayload.meta || {};
        const updatedRawPayload = {
          ...existingRawPayload,
          meta: {
            ...existingMeta,
            cost_status: costData.cost_status,
            cost_source: costData.cost_source,
            ...(durationObserved ? { duration_flag: "OVER_8_MIN" } : {}),
          },
        };
        
        // Update completion_state and cost (deterministic)
        const updatePayload: Record<string, any> = {
          completion_state: completionState,
          cost_usd: finalCostUsd, // Never null
          raw_payload: updatedRawPayload,
        };
        
        // Update using vapi_call_id and org_id for determinism
        const { data: updateResult, error: updateErr } = await supabaseAdmin
          .from("calls")
          .update(updatePayload)
          .eq("vapi_call_id", vapiCallId)
          .eq("org_id", existingCall.org_id ?? org_id)
          .select("id")
          .maybeSingle();
        
        // If update affects 0 rows, log and do safe upsert stub
        if (updateErr || !updateResult) {
          try {
            console.info(JSON.stringify({
              tag: "[COST][MISSING_CALL_ROW]",
              ts: Date.now(),
              call_id: callId,
              vapi_call_id: vapiCallId,
              org_id: existingCall.org_id ?? org_id,
            }));
          } catch (logErr) {
            // Never throw from logging
          }
          
          // Safe upsert stub that satisfies calls.vapi_call_id NOT NULL
          const stubPayload: Record<string, any> = {
            id: callId,
            vapi_call_id: vapiCallId,
            org_id: existingCall.org_id ?? org_id,
            call_type: "webcall",
            direction: "inbound",
            started_at: existingCall.started_at || startedAt,
            ended_at: startedAt,
            duration_seconds: finalDuration,
            completion_state: completionState,
            cost_usd: finalCostUsd, // Never null
            raw_payload: updatedRawPayload,
          };
          
          await supabaseAdmin
            .from("calls")
            .upsert(stubPayload, { onConflict: "vapi_call_id" });
        }
        
        // Always emit canonical log [COST][STATUS] with all required fields
        try {
          console.info(JSON.stringify({
            tag: "[COST][STATUS]",
            ts: Date.now(),
            call_id: callId,
            vapi_call_id: vapiCallId,
            cost_usd: finalCostUsd,
            cost_status: costData.cost_status,
            cost_source: costData.cost_source,
            duration_seconds: finalDuration,
            completion_state: completionState,
          }));
        } catch (logErr) {
          // Never throw from logging
        }

        // Canonical event: CALL_COMPLETED (only when auth succeeds)
        console.info(JSON.stringify({
          tag: "[CALL_COMPLETED]",
          ts: Date.now(),
          call_id: callId,
          org_id: existingCall.org_id ?? null,
          source: "webcall",
          event: "ended",
          completion_state: completionState,
          intent: existingCall.intent ?? null,
          intent_confidence: existingCall.intent_confidence ?? null,
          duration_seconds: finalDuration,
        }));

        return NextResponse.json({ 
          ok: true, 
          call_id: callId,
          completion_state: completionState,
          debug: { event: "ended", call_id: callId },
        });
      } catch (finalizeErr) {
        // Log but don't fail - call already updated with ended_at
        console.warn("[WEBCALL][EVENT] Finalization logic failed:", {
          call_id: callId,
          error: finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr),
        });
        return NextResponse.json({ ok: true, call_id: callId });
      }
    }

    return NextResponse.json(
      { ok: false, error: { code: "INVALID_EVENT" } },
      { status: 200 }
    );
  } catch (err) {
    console.error("[WEBCALL][EVENT] Exception:", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR" } },
      { status: 200 }
    );
  }
}

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({ ok: true, route: "webcall/event" });
}

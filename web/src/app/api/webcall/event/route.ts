import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const WebCallEventSchema = z.object({
  call_id: z.string().uuid(),
  event: z.enum(["started", "ended"]),
  ts: z.number(),
  meta: z.object({ channel: z.string().optional() }).optional(),
  duration_seconds: z.number().optional(),
});

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
 * For WebCall, we use vapi_call_id = `webcall:${call_id}` to distinguish from phone calls.
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

    const { call_id, event, ts, meta, duration_seconds } = parseResult.data;
    const vapiCallId = `webcall:${call_id}`;
    const startedAt = new Date(ts).toISOString();

    // Derive org_id from session
    const { org_id, error: orgError } = await deriveOrgIdFromSession();
    if (orgError || !org_id) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", recoverable: false } },
        { status: 200 }
      );
    }

    if (event === "started") {
      // Upsert call row (id = call_id, vapi_call_id = webcall:${call_id})
      const upsertPayload: Record<string, any> = {
        id: call_id,
        vapi_call_id: vapiCallId,
        org_id: org_id,
        call_type: "webcall",
        direction: "inbound",
        started_at: startedAt,
        raw_payload: { source: "webcall_event", meta, ts },
      };
      
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
      // Fetch existing call to get fields needed for finalization
      const { data: existingCallData, error: fetchErr } = await supabaseAdmin
        .from("calls")
        .select("id, org_id, agent_id, started_at, transcript, intent, intent_confidence, vapi_call_id")
        .eq("vapi_call_id", vapiCallId)
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
        // Create minimal call stub
        const stubPayload: Record<string, any> = {
          id: call_id,
          vapi_call_id: vapiCallId,
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
        console.info("[WEBCALL][EVENT][STUB_CREATED]", { call_id: callId });

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

      // Update call with ended_at and duration
      const updatePayload: Record<string, any> = {
        ended_at: startedAt,
      };

      if (duration_seconds !== undefined) {
        updatePayload.duration_seconds = duration_seconds;
      }

      const { error: updateErr } = await supabaseAdmin
        .from("calls")
        .update(updatePayload)
        .eq("id", callId);

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

      // Run finalization logic (completion_state, invariant enforcement)
      try {
        const finalDuration = duration_seconds ?? 
          (existingCall.started_at 
            ? Math.round((new Date(startedAt).getTime() - new Date(existingCall.started_at).getTime()) / 1000)
            : null);

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

        // Simple completion_state logic for web calls
        let completionState: "abandoned" | "partial" | "completed" = "abandoned";
        
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

        // Update completion_state
        await supabaseAdmin
          .from("calls")
          .update({ completion_state: completionState })
          .eq("id", callId);

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

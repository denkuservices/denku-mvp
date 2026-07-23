/**
 * Platform-level guardrails to prevent "annoying bot" behavior and loops.
 * 
 * These guardrails are deterministic, rule-based (no LLM), and idempotent.
 * They ensure the platform never dead-ends and always creates artifacts when needed.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// GR-3: Loop caps
const MAX_TURNS = 12;
const MAX_TOOL_CALLS = 3;

/**
 * GR-1: Repeat slot rule
 *
 * Detects if the AGENT asks for the same contact slot (phone/email) twice in the
 * same call — a genuine "annoying loop" — and forces a ticket + marks the call partial.
 *
 * R-053 fix: only count asks on AI-attributed lines (require 2+ *agent* asks). The
 * previous version counted phone/email vocabulary across the WHOLE transcript, so a
 * healthy exchange ("Agent: What's your phone number?" / "User: my phone is …")
 * falsely triggered. We split the transcript into speaker segments by their labels
 * (robust to inline or newline-separated turns) and only inspect agent segments.
 */
function detectRepeatSlotRequest(transcript: string | null): {
  triggered: boolean;
  slot?: "phone" | "email";
} {
  if (!transcript) return { triggered: false };

  // Split on speaker labels wherever they appear: "AI:", "Assistant:", "Agent:",
  // "User:", "Caller:", "System:". The capturing group keeps the labels in the array
  // so we can attribute each following chunk to a speaker.
  const tokens = transcript.split(/(AI|Assistant|Agent|User|Caller|System)\s*:/i);

  let phoneAsks = 0;
  let emailAsks = 0;

  // tokens[0] is any text before the first label; labels/text alternate after that.
  for (let i = 1; i < tokens.length; i += 2) {
    const speaker = (tokens[i] || "").toLowerCase();
    const text = (tokens[i + 1] || "").toLowerCase();
    const isAgent = speaker === "ai" || speaker === "assistant" || speaker === "agent";
    if (!isAgent || !text) continue;

    const looksLikeAsk =
      text.includes("?") ||
      /\b(can i|what'?s your|what is your|may i|could you|can you|provide|give me|share|again)\b/.test(text);
    if (!looksLikeAsk) continue;

    if (/\b(phone|telephone|mobile|cell)\b/.test(text)) phoneAsks++;
    if (/\b(email|e-mail)\b/.test(text)) emailAsks++;
  }

  // Trigger only when the AGENT asked for the same slot 2+ separate times.
  if (phoneAsks >= 2) {
    return { triggered: true, slot: "phone" };
  }
  if (emailAsks >= 2) {
    return { triggered: true, slot: "email" };
  }

  return { triggered: false };
}

/**
 * GR-2: Missing contact rule
 * 
 * Checks if both requester_phone and requester_email are missing at finalization.
 * If so, still creates/ensures ticket and marks call as partial.
 */
function checkMissingContact(
  fromPhone: string | null,
  requesterEmail: string | null
): boolean {
  const hasPhone = !!fromPhone && fromPhone.trim().length > 0;
  const hasEmail = !!requesterEmail && requesterEmail.trim().length > 0;
  return !hasPhone && !hasEmail;
}

/**
 * GR-3: Loop caps
 * 
 * Checks if call exceeds MAX_TURNS or MAX_TOOL_CALLS.
 * If exceeded, forces ticket and marks call as partial.
 */
function checkLoopCaps(
  userTurnCount: number,
  toolCallCount: number
): {
  triggered: boolean;
  reason?: "turns" | "tool_calls";
} {
  if (userTurnCount > MAX_TURNS) {
    return { triggered: true, reason: "turns" };
  }
  if (toolCallCount > MAX_TOOL_CALLS) {
    return { triggered: true, reason: "tool_calls" };
  }
  return { triggered: false };
}

/**
 * Count tool calls from raw payload.
 * Looks for function calls or tool invocations in the payload.
 */
function countToolCalls(rawPayload: any): number {
  if (!rawPayload) return 0;
  
  let count = 0;
  
  // Check for function calls in messages
  const messages = rawPayload?.message?.messages || rawPayload?.messages || [];
  for (const msg of messages) {
    if (msg?.functionCall || msg?.toolCall || msg?.type === "function_call") {
      count++;
    }
  }
  
  // Check for tool calls in summary_table or other structures
  const summaryTable = rawPayload?.message?.summary_table || rawPayload?.summary_table;
  if (summaryTable?.functionCalls) {
    count += Array.isArray(summaryTable.functionCalls) ? summaryTable.functionCalls.length : 0;
  }
  
  return count;
}

/**
 * Main guardrail check function.
 * 
 * Evaluates all guardrails and returns actions to take.
 * All guardrails are idempotent - repeated calls return the same result.
 */
export async function checkCallGuardrails(opts: {
  callId: string;
  orgId: string;
  transcript: string | null;
  fromPhone: string | null;
  toPhone: string | null;
  rawPayload: any;
  userTurnCount: number;
  requesterEmail?: string | null;
}): Promise<{
  forceTicket: boolean;
  setPartial: boolean;
  reason?: string;
}> {
  const {
    callId,
    orgId,
    transcript,
    fromPhone,
    toPhone,
    rawPayload,
    userTurnCount,
    requesterEmail,
  } = opts;

  try {
    // GR-1: Repeat slot rule
    const repeatSlot = detectRepeatSlotRequest(transcript);
    if (repeatSlot.triggered) {
      console.info("[GUARDRAIL][REPEAT_SLOT]", {
        call_id: callId,
        slot: repeatSlot.slot,
      });
      
      // Force ticket creation
      await ensureTicketForCall(callId, orgId, fromPhone, toPhone, transcript, rawPayload);
      
      return {
        forceTicket: true,
        setPartial: true,
        reason: `repeat_slot_${repeatSlot.slot}`,
      };
    }

    // GR-2: Missing contact rule is checked at finalization (after ticket creation)
    // See webhook handler completion_state logic

    // GR-3: Loop caps
    const toolCallCount = countToolCalls(rawPayload);
    const loopCap = checkLoopCaps(userTurnCount, toolCallCount);
    if (loopCap.triggered) {
      console.info("[GUARDRAIL][LOOP_CAP]", {
        call_id: callId,
        reason: loopCap.reason,
        user_turns: userTurnCount,
        tool_calls: toolCallCount,
      });
      
      // Force ticket creation
      await ensureTicketForCall(callId, orgId, fromPhone, toPhone, transcript, rawPayload);
      
      return {
        forceTicket: true,
        setPartial: true,
        reason: `loop_cap_${loopCap.reason}`,
      };
    }

    // No guardrails triggered
    return {
      forceTicket: false,
      setPartial: false,
    };
  } catch (err) {
    // Never throw - log and continue
    console.error("[GUARDRAIL] Exception in guardrail check:", {
      call_id: callId,
      error: err instanceof Error ? err.message : String(err),
    });
    
    return {
      forceTicket: false,
      setPartial: false,
    };
  }
}

/**
 * Helper to ensure ticket exists (idempotent).
 * Creates ticket directly via DB insert, marking it as guardrail-created.
 * This is idempotent - repeated calls with same call_id won't create duplicates.
 */
async function ensureTicketForCall(
  callId: string,
  orgId: string,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null,
  rawPayload: any
): Promise<void> {
  try {
    // Idempotency: Check if ticket already exists
    const { data: existingTicket } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingTicket) {
      return; // Already have ticket
    }

    // Create ticket with minimal fields
    const subject = "Support Request";
    const description = transcript || "Call artifact created by guardrail.";
    
    // Add guardrail marker (similar to deterministic marker pattern)
    const finalDescription = description + "\n[System] created_by=guardrail";

    const { error: insertErr } = await supabaseAdmin
      .from("tickets")
      .insert({
        org_id: orgId,
        call_id: callId,
        subject,
        description: finalDescription,
        status: "open",
        priority: "normal",
        requester_phone: fromPhone,
      })
      .select("id")
      .single();

    if (insertErr) {
      // If insert fails (e.g., race condition), check again
      const { data: raceExisting } = await supabaseAdmin
        .from("tickets")
        .select("id")
        .eq("call_id", callId)
        .maybeSingle<{ id: string }>();
      
      if (!raceExisting) {
        throw insertErr; // Only throw if ticket still doesn't exist
      }
    }
  } catch (err) {
    // Never throw - log and continue
    console.error("[GUARDRAIL] Failed to ensure ticket:", {
      call_id: callId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

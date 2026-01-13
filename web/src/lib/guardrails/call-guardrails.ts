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
 * Detects if the agent asks for the same contact slot (phone/email) twice in the same call.
 * If detected, forces ticket creation and marks call as partial.
 * 
 * Rule: Look for patterns in transcript where agent asks for phone/email multiple times.
 */
function detectRepeatSlotRequest(transcript: string | null): {
  triggered: boolean;
  slot?: "phone" | "email";
} {
  if (!transcript) return { triggered: false };

  const lowerTranscript = transcript.toLowerCase();
  
  // Patterns that indicate asking for phone
  const phonePatterns = [
    /\b(phone number|phone|telephone|mobile|cell|contact number)\b/gi,
    /\b(can i get|what's your|what is your|may i have|could you provide)\b.*\b(phone|number)\b/gi,
  ];
  
  // Patterns that indicate asking for email
  const emailPatterns = [
    /\b(email address|email|e-mail|mail)\b/gi,
    /\b(can i get|what's your|what is your|may i have|could you provide)\b.*\b(email|mail)\b/gi,
  ];
  
  // Count occurrences
  let phoneAsks = 0;
  let emailAsks = 0;
  
  for (const pattern of phonePatterns) {
    const matches = lowerTranscript.match(pattern);
    if (matches) phoneAsks += matches.length;
  }
  
  for (const pattern of emailPatterns) {
    const matches = lowerTranscript.match(pattern);
    if (matches) emailAsks += matches.length;
  }
  
  // Trigger if same slot asked for 2+ times
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

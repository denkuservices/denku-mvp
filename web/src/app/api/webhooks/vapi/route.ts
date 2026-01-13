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
import { checkCallGuardrails } from "@/lib/guardrails/call-guardrails";

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

/**
 * Mask phone number for logging (show first 4 chars + last 4 chars).
 * Example: +13215555718 -> +132***5718
 */
function maskPhoneForLogging(phone: string | null): string {
  if (!phone || phone.length < 8) return phone || "null";
  if (phone.length <= 8) return `${phone.slice(0, 2)}***${phone.slice(-2)}`;
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
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
 * Detect call intent from webhook payload.
 * Returns "support" | "appointment" | "other".
 * 
 * TODO: Enhance with transcript analysis or other heuristics as needed.
 * For now, defaults to "other" since we don't have transcript at call start.
 */
function detectCallIntent(body: any, direction: string): "support" | "appointment" | "other" {
  // For now, default to "other" since intent detection requires transcript analysis
  // which is not available at call start. This can be enhanced later with:
  // - Transcript keyword analysis
  // - Vapi function call tracking
  // - Other heuristics
  return "other";
}

/**
 * Validate persona exists in personas catalog and is active.
 * Returns true if persona exists and is_active = true, false otherwise.
 */
async function validatePersona(personaKey: string): Promise<boolean> {
  try {
    const { data: persona, error: personaError } = await supabaseAdmin
      .from("personas")
      .select("key, is_active")
      .eq("key", personaKey)
      .maybeSingle<{ key: string; is_active: boolean | null }>();

    if (personaError) {
      console.error("[PERSONA] Failed to validate persona:", personaKey, personaError);
      return false;
    }

    if (!persona) {
      return false;
    }

    // Check is_active (default to true if null for backwards compatibility)
    return persona.is_active !== false;
  } catch (err) {
    console.error("[PERSONA] Exception validating persona:", personaKey, err);
    return false;
  }
}

/**
 * Stub function to check if org has sales persona entitlement.
 * TODO: Connect to org_addons table to check for sales persona entitlement.
 */
async function checkSalesEntitlement(orgId: string): Promise<boolean> {
  // Stub: always return false for now
  // TODO: Implement actual entitlement check via org_addons table
  return false;
}

/**
 * Check if call is outside business hours.
 * Returns true if outside hours, false if inside hours or no business hours config.
 */
function isOutsideBusinessHours(
  callTimestamp: string,
  agentTimezone: string | null,
  businessHoursConfig: any
): boolean {
  // If no business hours config exists, treat as inside hours
  if (!businessHoursConfig) {
    return false;
  }

  // TODO: Implement business hours logic based on businessHoursConfig
  // For now, return false (inside hours) since config structure is not defined yet
  return false;
}

/**
 * Select persona_key for a call based on language, intent, and entitlements.
 * 
 * Selection logic:
 * 1. Language: Use agent.language if present; fallback to 'en'
 * 2. Intent: support/appointment/other -> support_<lang>
 * 3. Fallback order: support_<lang> -> agent.default_persona_key -> support_en
 * 
 * Returns persona_key string (always returns at least "support_en" as safe fallback).
 */
async function selectPersonaKeyForCall(
  agentId: string,
  intent: "support" | "appointment" | "other" | null,
  callTimestamp: string,
  orgId: string,
  vapiCallId?: string
): Promise<string> {
  const safeFallback = "support_en";
  
  try {
    // Fetch agent config (without business_hours column)
    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("language, timezone, default_persona_key")
      .eq("id", agentId)
      .maybeSingle<{
        language: string | null;
        timezone: string | null;
        default_persona_key: string | null;
      }>();

    if (agentError || !agent) {
      console.warn("[PERSONA] Failed to fetch agent, using fallback:", {
        agentId,
        vapiCallId,
        error: agentError?.message ?? "agent not found",
      });
      return safeFallback;
    }

    // Determine language (fallback to 'en')
    const lang = agent.language?.toLowerCase() || "en";
    const langSuffix = lang === "en" ? "en" : lang.split("-")[0] || "en"; // Normalize language code

    // Build candidate persona keys based on intent and context
    const candidates: string[] = [];

    // Intent-based selection
    // Note: detectCallIntent currently only returns "support" | "appointment" | "other"
    // If "sales" intent is added in the future, it would be handled here with entitlement check
    // For now, all intents map to support_<lang>
    candidates.push(`support_${langSuffix}`);

    // Fallback candidates (in order)
    if (agent.default_persona_key) {
      candidates.push(agent.default_persona_key);
    }
    candidates.push(safeFallback); // Final fallback (always included)

    // Try each candidate in order (validate when possible, but allow fallback if validation fails)
    for (const candidateKey of candidates) {
      try {
        const isValid = await validatePersona(candidateKey);
        if (isValid) {
          return candidateKey;
        }
      } catch (validationErr) {
        // Log but continue to next candidate
        console.warn("[PERSONA] Validation failed for candidate, trying next:", {
          agentId,
          vapiCallId,
          candidateKey,
          error: validationErr instanceof Error ? validationErr.message : String(validationErr),
        });
        continue;
      }
    }

    // If we get here, all validation failed - return safe fallback
    console.warn("[PERSONA] All persona validation failed, using safe fallback:", {
      agentId,
      vapiCallId,
      intent,
      lang: langSuffix,
      candidates,
    });
    return safeFallback;
  } catch (err) {
    console.warn("[PERSONA] Exception selecting persona, using fallback:", {
      agentId,
      vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
    return safeFallback;
  }
}

/**
 * Select persona_key for a call (legacy function for backwards compatibility).
 * For now, delegates to selectPersonaKeyForCall with default parameters.
 * 
 * @deprecated Use selectPersonaKeyForCall instead.
 */
async function selectPersonaKey(agentId: string): Promise<string> {
  // Legacy: use default intent and current timestamp
  return selectPersonaKeyForCall(agentId, "other", new Date().toISOString(), "");
}

/**
 * Check if a call is a web call (for demo abuse detection).
 * Returns true if call.type === "webCall" OR call.transport.provider === "daily".
 */
function isWebCall(body: any): boolean {
  const msg = body?.message;
  const call = msg?.call;
  
  const callType = call?.type ?? msg?.summary_table?.type ?? null;
  const transportProvider = call?.transport?.provider ?? null;
  
  return callType === "webCall" || transportProvider === "daily";
}

/**
 * Build ticket subject from transcript using keyword matching.
 * Returns: "Billing Question", "Order Issue", "Scheduling Request", or "Support Request".
 */
function buildTicketSubject(transcript: string | null): string {
  if (!transcript) return "Support Request";
  
  const normalized = transcript.toLowerCase();
  
  // Billing keywords
  const billingKeywords = ["refund", "chargeback", "charged", "payment", "billing", "invoice", "card", "subscription", "plan", "cancel"];
  if (billingKeywords.some(keyword => normalized.includes(keyword))) {
    return "Billing Question";
  }
  
  // Order keywords
  const orderKeywords = ["order", "shipment", "shipping", "delivery", "tracking", "arrived", "missing", "damaged", "return", "exchange"];
  if (orderKeywords.some(keyword => normalized.includes(keyword))) {
    return "Order Issue";
  }
  
  // Scheduling keywords
  const schedulingKeywords = ["appointment", "schedule", "reschedule", "booking", "book", "availability"];
  if (schedulingKeywords.some(keyword => normalized.includes(keyword))) {
    return "Scheduling Request";
  }
  
  return "Support Request";
}

/**
 * Build premium ticket description with metadata header.
 * Format:
 * [Channel] Phone Call | Web Call
 * [Caller] +1XXXXXXXXXX OR Unknown (Web Call)
 * [Agent] <persona_key if present else agent_id>
 * [Vapi] <vapi_call_id>
 * [Time] <started_at ISO> → <ended_at ISO or "ongoing">
 * 
 * (blank line)
 * [WebCall] No caller phone available. (only for web calls without phone)
 * (blank line)
 * Then transcript content
 */
function buildTicketDescription(opts: {
  isWebCall: boolean;
  fromPhone: string | null;
  personaKey: string | null;
  agentId: string | null;
  vapiCallId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  transcript: string | null;
}): string {
  const {
    isWebCall,
    fromPhone,
    personaKey,
    agentId,
    vapiCallId,
    startedAt,
    endedAt,
    transcript,
  } = opts;
  
  // Build header lines
  const channel = isWebCall ? "Web Call" : "Phone Call";
  const caller = fromPhone || (isWebCall ? "Unknown (Web Call)" : "Unknown");
  const agent = personaKey || agentId || "Unknown";
  const vapi = vapiCallId || "Unknown";
  const startTime = startedAt || "unknown";
  const endTime = endedAt || "ongoing";
  
  const header = [
    `[Channel] ${channel}`,
    `[Caller] ${caller}`,
    `[Agent] ${agent}`,
    `[Vapi] ${vapi}`,
    `[Time] ${startTime} → ${endTime}`,
  ].join("\n");
  
  // Build body
  let body = "";
  
  // Add web call notice if applicable
  if (isWebCall && !fromPhone) {
    body = "[WebCall] No caller phone available.\n\n";
  }
  
  // Add transcript
  const transcriptContent = transcript || "No transcript available.";
  body += transcriptContent;
  
  // Combine header, blank line, and body
  return `${header}\n\n${body}`;
}

/**
 * Upsert call and return call row ID (idempotent by vapi_call_id).
 * Uses Supabase upsert with onConflict: "vapi_call_id".
 * Always returns a call ID (fetches existing if upsert fails).
 */
async function upsertCallAndGetId(
  payload: Record<string, any>,
  vapiCallId: string
): Promise<string | null> {
  try {
    // Remove 'id' to avoid forcing inserts
    const upsertPayload = { ...compact(payload) };
    delete (upsertPayload as any).id;
    
    // Add updated_at
    upsertPayload.updated_at = new Date().toISOString();
    
    // Upsert with onConflict on vapi_call_id
    const { data: result, error } = await supabaseAdmin
      .from("calls")
      .upsert(upsertPayload, { onConflict: "vapi_call_id" })
      .select("id")
      .single();
    
    if (error) {
      // If upsert fails, try to fetch existing row
      console.warn("[CALL UPSERT] Upsert failed, fetching existing row:", {
        vapiCallId,
        error: error.message,
      });
      
      const { data: existing } = await supabaseAdmin
        .from("calls")
        .select("id")
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle<{ id: string }>();
      
      if (existing) {
        return existing.id;
      }
      
      console.error("[CALL UPSERT] Failed to upsert or fetch existing call:", {
        vapiCallId,
        error: error.message,
      });
      return null;
    }
    
    return result?.id ?? null;
  } catch (err) {
    console.error("[CALL UPSERT] Exception in upsertCallAndGetId:", {
      vapiCallId,
      error: err instanceof Error ? err.message : String(err),
    });
    
    // Try to fetch existing row as fallback
    try {
      const { data: existing } = await supabaseAdmin
        .from("calls")
        .select("id")
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle<{ id: string }>();
      
      return existing?.id ?? null;
    } catch (fetchErr) {
      console.error("[CALL UPSERT] Failed to fetch existing call as fallback:", fetchErr);
      return null;
    }
  }
}

/**
 * Check if transcript contains off-topic keywords (recipes, cooking, gym plans, etc.).
 * Returns true if off-topic usage detected.
 */
function hasOffTopicContent(transcript: string | null): boolean {
  if (!transcript) return false;
  
  const normalized = transcript.toLowerCase();
  const offTopicKeywords = [
    'recipe',
    'cook',
    'cooking',
    'gym plan',
    'workout plan',
    'exercise routine',
    'diet plan',
    'meal plan',
    'how to make',
    'ingredients for',
  ];
  
  return offTopicKeywords.some((keyword) => normalized.includes(keyword));
}

/**
 * Check if call duration exceeds demo limit (5 minutes).
 * Returns true if duration exceeds 5 minutes.
 */
function exceedsDemoDuration(startedAt: string | null, endedAt: string | null, durationSeconds: number | null): boolean {
  const DEMO_MAX_DURATION_SECONDS = 5 * 60; // 5 minutes
  
  if (durationSeconds !== null && durationSeconds > DEMO_MAX_DURATION_SECONDS) {
    return true;
  }
  
  if (startedAt && endedAt) {
    const started = new Date(startedAt).getTime();
    const ended = new Date(endedAt).getTime();
    if (!isNaN(started) && !isNaN(ended)) {
      const durationMs = ended - started;
      const durationSec = Math.floor(durationMs / 1000);
      return durationSec > DEMO_MAX_DURATION_SECONDS;
    }
  }
  
  return false;
}

/**
 * Create abuse/misuse ticket for demo calls that exceed limits.
 * Idempotent: checks for existing ticket by call_id before creating.
 */
async function createAbuseTicket(
  callId: string,
  orgId: string,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null,
  reason: string
): Promise<void> {
  try {
    // Check if abuse ticket already exists (idempotency)
    const { data: existingTicket } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .eq("subject", "Demo misuse / exceeded limits")
      .maybeSingle<{ id: string }>();

    if (existingTicket) {
      console.log("[DEMO GUARDRAIL] Abuse ticket already exists:", { callId, ticketId: existingTicket.id });
      return;
    }

    const subject = "Demo misuse / exceeded limits";
    const description = `Demo call exceeded limits.\n\nReason: ${reason}\n\nTranscript snippet: ${transcript?.substring(0, 500) || "No transcript available"}`;

    // Use existing createTicketForCall function with special subject
    // We need to modify it slightly or call the tool route directly
    // For now, let's call the tool route directly
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const toolSecret = process.env.DENKU_TOOL_SECRET || "";

    if (!toPhone || !fromPhone) {
      console.error("[DEMO GUARDRAIL] Missing phone numbers for abuse ticket:", { callId, toPhone, fromPhone });
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/tools/create-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(toolSecret && { "x-denku-secret": toolSecret }),
        },
        body: JSON.stringify({
          to_phone: toPhone,
          lead_phone: fromPhone,
          subject,
          description,
          call_id: callId,
          priority: "normal",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("[DEMO GUARDRAIL] Abuse ticket created:", { callId, ticketId: result.ticket?.id, reason });
        return;
      }

      // Fallback: Direct DB insert
      const leadId = await resolveLeadId(orgId, fromPhone);
      if (!leadId) {
        console.error("[DEMO GUARDRAIL] Failed to resolve lead for abuse ticket:", { callId, orgId, fromPhone });
        return;
      }

      const { data: ticket, error: dbErr } = await supabaseAdmin
        .from("tickets")
        .insert({
          org_id: orgId,
          lead_id: leadId,
          call_id: callId,
          subject,
          description,
          status: "open",
          priority: "normal",
        })
        .select("id")
        .single();

      if (dbErr || !ticket?.id) {
        console.error("[DEMO GUARDRAIL] Failed to create abuse ticket:", { callId, orgId, error: dbErr });
      } else {
        console.log("[DEMO GUARDRAIL] Abuse ticket created via direct insert:", { callId, ticketId: ticket.id, reason });
      }
    } catch (err) {
      console.error("[DEMO GUARDRAIL] Exception creating abuse ticket:", { callId, orgId, error: err });
    }
  } catch (err) {
    console.error("[DEMO GUARDRAIL] Exception in createAbuseTicket:", { callId, orgId, error: err });
    // Never throw - allow call finalization to continue
  }
}

/**
 * Count user turns in transcript (count "User:" lines).
 * Fallback: returns 0 if transcript is null/empty.
 */
function countUserTurns(transcript: string | null): number {
  if (!transcript) return 0;
  
  // Count lines that start with "User:" (case-insensitive)
  const lines = transcript.split("\n");
  let count = 0;
  for (const line of lines) {
    if (line.trim().toLowerCase().startsWith("user:")) {
      count++;
    }
  }
  return count;
}

/**
 * Compute intent_confidence based on intent, transcript, duration, and user turns.
 * Returns a value between 0 and 1, rounded to 3 decimals.
 */
function computeIntentConfidence(
  intent: "support" | "appointment" | "other" | null,
  transcript: string | null,
  durationSeconds: number | null,
  userTurnCount: number
): number {
  // Base confidence
  let confidence = 0.0;
  if (intent === "appointment" || intent === "support") {
    confidence = 0.70;
  } else {
    confidence = 0.40; // "other" or null
  }
  
  // Add +0.15 if transcript matches strong intent keywords
  if (transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (intent === "appointment") {
      const appointmentKeywords = /\b(schedule|book|appointment|tomorrow|next week|afternoon|am|pm|at [0-9])\b/;
      if (appointmentKeywords.test(lowerTranscript)) {
        confidence += 0.15;
      }
    } else if (intent === "support") {
      const supportKeywords = /\b(order|refund|late|broken|issue|problem|missing|damaged)\b/;
      if (supportKeywords.test(lowerTranscript)) {
        confidence += 0.15;
      }
    }
  }
  
  // Add +0.05 if durationSeconds >= 20
  if (durationSeconds !== null && durationSeconds >= 20) {
    confidence += 0.05;
  }
  
  // Add +0.05 if userTurnCount >= 2
  if (userTurnCount >= 2) {
    confidence += 0.05;
  }
  
  // Clamp to [0, 1] and round to 3 decimals
  confidence = Math.max(0, Math.min(1, confidence));
  return Math.round(confidence * 1000) / 1000;
}

/**
 * Check if transcript has truncated agent last line.
 * Returns true if last non-empty line starts with "AI:" and looks cut off.
 */
function detectTruncatedAgentLastLine(transcript: string | null): boolean {
  if (!transcript) return false;
  
  const lines = transcript.split("\n").filter(line => line.trim().length > 0);
  if (lines.length === 0) return false;
  
  const lastLine = lines[lines.length - 1].trim();
  if (!lastLine.toLowerCase().startsWith("ai:")) return false;
  
  const content = lastLine.substring(3).trim();
  if (content.length === 0) return false;
  
  // Check for trailing indicators of truncation
  const lastChar = content[content.length - 1];
  if (lastChar === "," || (lastChar === "." && content.endsWith("..."))) {
    return true;
  }
  
  // Check for incomplete sentences (no punctuation)
  if (!/[.!?]$/.test(content)) {
    // Check for mid-sentence patterns
    const incompletePatterns = /\b(create|set up|provide|contact|details)$/i;
    if (incompletePatterns.test(content)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detect if a tool was called based on payload structure.
 * Conservative: returns true only if strong indicators exist.
 */
function detectToolUsed(rawPayload: any): boolean {
  if (!rawPayload) return false;
  
  const msg = rawPayload?.message;
  const artifact = msg?.artifact;
  const messages = msg?.messages;
  
  // Check for function-call in messages
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (m?.type === "function-call" || m?.role === "function") {
        return true;
      }
    }
  }
  
  // Check for artifact indicating tool execution
  if (artifact) {
    // If artifact exists and has meaningful content, tool may have run
    // But this is conservative - we need stronger signals
    // For now, only return true if explicit function-call found
  }
  
  return false;
}

/**
 * Infer completion_state based on intent, duration, transcript, artifacts, and call metadata.
 * Returns: "abandoned" | "completed" | "partial"
 * 
 * Rules:
 * - abandoned: duration <= 8 AND userTurns == 0, OR empty transcript AND duration <= 15
 * - partial: userTurns >= 1 AND (duration < 30 OR truncated OR (toolUsed == false AND deterministic artifact))
 * - completed: toolUsed == true OR (duration >= 30 AND userTurns >= 2 AND not truncated) OR non-deterministic artifact
 * - fallback: completed if duration >= 15, else partial
 */
function inferCompletionState(
  intent: string | null,
  durationSeconds: number | null,
  transcript: string | null,
  userTurns: number,
  toolUsed: boolean,
  truncatedAgentLastLine: boolean,
  deterministicTicket: boolean,
  deterministicAppointment: boolean,
  ticketCreated: boolean,
  appointmentCreated: boolean
): "abandoned" | "completed" | "partial" {
  // ABANDONED: durationSeconds <= 8 AND userTurns == 0, OR empty transcript AND duration <= 15
  if (durationSeconds !== null && durationSeconds <= 8 && userTurns === 0) {
    return "abandoned";
  }
  
  if ((!transcript || transcript.trim().length < 20) && durationSeconds !== null && durationSeconds <= 15) {
    return "abandoned";
  }
  
  // PARTIAL: userTurns >= 1 AND (duration < 30 OR truncated OR (toolUsed == false AND deterministic artifact))
  if (userTurns >= 1) {
    if (durationSeconds !== null && durationSeconds < 30) {
      return "partial";
    }
    
    if (truncatedAgentLastLine) {
      return "partial";
    }
    
    if (!toolUsed && (deterministicTicket || deterministicAppointment)) {
      return "partial";
    }
  }
  
  // COMPLETED: toolUsed == true OR (duration >= 30 AND userTurns >= 2 AND not truncated) OR non-deterministic artifact
  if (toolUsed) {
    return "completed";
  }
  
  if (durationSeconds !== null && durationSeconds >= 30 && userTurns >= 2 && !truncatedAgentLastLine) {
    return "completed";
  }
  
  // Non-deterministic artifact (ticket/appointment exists but without deterministic marker)
  if ((ticketCreated && !deterministicTicket) || (appointmentCreated && !deterministicAppointment)) {
    return "completed";
  }
  
  // FALLBACK: completed if duration >= 15, else partial
  if (durationSeconds !== null && durationSeconds >= 15) {
    return "completed";
  }
  
  return "partial";
}

/**
 * Check if transcript contains strong detail signals (order numbers, email, phone, address, dates/times, or substantial user content).
 */
function checkStrongDetailSignals(transcript: string | null): boolean {
  if (!transcript) return false;
  
  const lowerTranscript = transcript.toLowerCase();
  
  // Order number patterns
  if (/\b(order\s*#|order\s*number|#\s*\d{3,}|order\s*\d{3,})\b/i.test(transcript)) {
    return true;
  }
  
  // Email-like pattern
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(transcript)) {
    return true;
  }
  
  // Phone-like pattern (E.164 or common formats)
  if (/\b(\+?1?\s*\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10,})\b/.test(transcript)) {
    return true;
  }
  
  // Address keywords
  if (/\b(street|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|city|state|zip|postal)\b/i.test(transcript)) {
    return true;
  }
  
  // Dates/times
  if (/\b(tomorrow|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|am|pm|morning|afternoon|evening)\b/i.test(transcript)) {
    return true;
  }
  
  // Check for at least 2 sentences from user beyond simple responses
  const userLines = transcript.split("\n").filter(line => line.trim().toLowerCase().startsWith("user:"));
  const substantialUserLines = userLines.filter(line => {
    const content = line.substring(5).trim().toLowerCase();
    // Exclude simple responses
    const excludePatterns = /^(i don't know|i just wanted to let you know|ok|okay|thanks|thank you|yeah|yes|no|sure)$/i;
    return !excludePatterns.test(content) && content.length > 20;
  });
  
  if (substantialUserLines.length >= 2) {
    return true;
  }
  
  return false;
}

/**
 * Check if transcript includes strong closing phrases from AI.
 */
function checkStrongClosingPhrases(transcript: string | null): boolean {
  if (!transcript) return false;
  
  const lowerTranscript = transcript.toLowerCase();
  
  const closingPhrases = [
    "i've created a ticket",
    "i have created",
    "your ticket number",
    "ticket number is",
    "i booked",
    "appointment is scheduled",
    "you're all set",
    "i've submitted",
    "ticket has been created",
    "appointment has been scheduled",
  ];
  
  for (const phrase of closingPhrases) {
    if (lowerTranscript.includes(phrase)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Ensure ticket exists for a call with intent = "support" (or "other" treated as support).
 * Idempotent: checks for existing ticket by call_id before creating.
 * 
 * This is a post-call guarantee: ensures every call with intent="support" (or "other")
 * always results in a ticket artifact, even if the LLM never calls a tool.
 * 
 * Note: For appointment intent, do NOT call this function. Use ensureAppointmentForCall instead.
 */
async function ensureTicketForCall(
  callId: string,
  orgId: string,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null,
  rawPayload: any,
  vapiCallId?: string
): Promise<void> {
  try {
    // Idempotency: Check if ticket already exists
    const { data: existingTicket } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingTicket) {
      console.log("[DETERMINISTIC] Ticket ensured for call", { callId, ticketId: existingTicket.id });
      
      // Canonical event: ARTIFACT_CREATED (existing)
      try {
        console.info(JSON.stringify({
          tag: "[ARTIFACT_CREATED]",
          ts: Date.now(),
          call_id: callId,
          org_id: orgId ?? null,
          source: "vapi_webhook",
          artifact_id: existingTicket.id,
          artifact_type: "ticket",
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      
      return; // Already have ticket, nothing to do
    }

    // Detect if this is a web call
    const isWebCallType = isWebCall(rawPayload);
    
    // Create ticket (support intent)
    await createTicketForCall(callId, orgId, fromPhone, toPhone, transcript, "support", isWebCallType, rawPayload, vapiCallId);
    
    console.log("[DETERMINISTIC] Ticket ensured for call", { callId });
  } catch (err) {
    console.error("[DETERMINISTIC] Exception ensuring ticket for call:", { callId, orgId, error: err });
    // Never throw - allow call finalization to continue
  }
}

/**
 * Ensure appointment exists for a call with intent = "appointment".
 * Idempotent: checks for existing appointment by call_id before creating.
 * 
 * This is a post-call guarantee: ensures every call with intent="appointment"
 * always results in an appointment artifact, even if the LLM never calls a tool.
 * 
 * Creation strategy:
 * - Direct DB insert (tool route requires datetime which we don't have for requests)
 * - Status: "requested"
 * - Source: "voice"
 * - Notes: Full transcript
 */
async function ensureAppointmentForCall(
  callId: string,
  orgId: string,
  transcript: string | null,
  fromPhone: string | null
): Promise<void> {
  try {
    // Idempotency: Check if appointment already exists
    const { data: existingAppointment } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingAppointment) {
      console.log("[DETERMINISTIC] Appointment ensured for call", {
        callId,
        appointmentId: existingAppointment.id,
      });
      
      // Canonical event: ARTIFACT_CREATED (existing)
      try {
        console.info(JSON.stringify({
          tag: "[ARTIFACT_CREATED]",
          ts: Date.now(),
          call_id: callId,
          org_id: orgId ?? null,
          source: "vapi_webhook",
          artifact_id: existingAppointment.id,
          artifact_type: "appointment",
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      
      return; // Already have appointment, nothing to do
    }

    // Resolve lead_id by phone (if caller phone exists)
    let leadId: string | null = null;
    if (fromPhone) {
      leadId = await resolveLeadId(orgId, fromPhone);
    }

    // Create appointment via direct DB insert
    // Note: Tool route requires datetime which we don't have for appointment requests
    // So we skip tool route and go straight to DB insert
    // Use full transcript in notes (appointments table should handle long text)
    let finalNotes = transcript || "";
    
    // Add deterministic marker if not already present (idempotent)
    const deterministicMarker = "[System] created_by=deterministic";
    if (finalNotes && !finalNotes.includes(deterministicMarker)) {
      finalNotes = finalNotes + "\n" + deterministicMarker;
    } else if (!finalNotes) {
      finalNotes = deterministicMarker;
    }
    
    const { data: appointment, error: insertErr } = await supabaseAdmin
      .from("appointments")
      .insert({
        org_id: orgId,
        lead_id: leadId,
        call_id: callId,
        status: "requested",
        source: "voice",
        notes: finalNotes,
      })
      .select("id")
      .single();

    if (insertErr || !appointment) {
      console.error("[DETERMINISTIC] Failed to create appointment for call", {
        callId,
        orgId,
        error: insertErr?.message ?? "unknown error",
      });
      return;
    }

    console.log("[DETERMINISTIC] Appointment ensured for call", {
      callId,
      appointmentId: appointment.id,
      orgId,
    });
    
    // Canonical event: ARTIFACT_CREATED
    try {
      console.info(JSON.stringify({
        tag: "[ARTIFACT_CREATED]",
        ts: Date.now(),
        call_id: callId,
        org_id: orgId ?? null,
        source: "vapi_webhook",
        artifact_id: appointment.id,
        artifact_type: "appointment",
      }));
    } catch (logErr) {
      // Never throw from logging
    }
  } catch (err) {
    console.error("[DETERMINISTIC] Exception ensuring appointment for call:", {
      callId,
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    // Never throw - allow call finalization to continue
  }
}

/**
 * Create ticket for a call via tool route or direct DB insert fallback.
 * Idempotent: checks call_id before creating.
 * 
 * Tool route is only used for phone calls with caller phone present.
 * Web calls or calls without caller phone use direct DB insert.
 */
async function createTicketForCall(
  callId: string,
  orgId: string,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null,
  intentType: "appointment" | "support",
  isWebCallType: boolean,
  rawPayload?: any,
  vapiCallId?: string
): Promise<void> {
  // Build subject using heuristic (for support) or appointment label
  const subject = intentType === "appointment" ? "Appointment Request" : buildTicketSubject(transcript);
  const hasCallerPhone = !!fromPhone && fromPhone.trim().length > 0;
  
  // Fetch call row to get metadata for description header
  let callRowData: {
    persona_key: string | null;
    agent_id: string | null;
    started_at: string | null;
    ended_at: string | null;
    vapi_call_id: string | null;
  } | null = null;
  
  try {
    const { data: callRow } = await supabaseAdmin
      .from("calls")
      .select("persona_key, agent_id, started_at, ended_at, vapi_call_id")
      .eq("id", callId)
      .maybeSingle<{
        persona_key: string | null;
        agent_id: string | null;
        started_at: string | null;
        ended_at: string | null;
        vapi_call_id: string | null;
      }>();
    
    callRowData = callRow;
  } catch (fetchErr) {
    console.warn("[ARTIFACT] Failed to fetch call row for metadata:", {
      callId,
      error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    });
    // Continue with available data
  }
  
  // Build premium description with metadata header
  const description = buildTicketDescription({
    isWebCall: isWebCallType,
    fromPhone,
    personaKey: callRowData?.persona_key ?? null,
    agentId: callRowData?.agent_id ?? null,
    vapiCallId: callRowData?.vapi_call_id ?? vapiCallId ?? null,
    startedAt: callRowData?.started_at ?? null,
    endedAt: callRowData?.ended_at ?? null,
    transcript: transcript || `Call artifact created for ${intentType} intent.`,
  });

  // Skip tool route for web calls or when caller phone is missing
  if (isWebCallType || !hasCallerPhone) {
    console.log("[ARTIFACT] skip tool route: webCall or missing from_phone", {
      callId,
      isWebCallType,
      hasCallerPhone,
    });
    // Fall through to direct DB insert
  } else if (toPhone && fromPhone) {
    // Try tool route first (only for phone calls with caller phone)
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const toolSecret = process.env.DENKU_TOOL_SECRET || "";

      // Canonical event: TOOL_CALLED
      try {
        console.info(JSON.stringify({
          tag: "[TOOL_CALLED]",
          ts: Date.now(),
          call_id: callId,
          org_id: orgId ?? null,
          source: "vapi_webhook",
          tool: "create-ticket",
        }));
      } catch (logErr) {
        // Never throw from logging
      }

      const response = await fetch(`${baseUrl}/api/tools/create-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(toolSecret && { "x-denku-secret": toolSecret }),
        },
        body: JSON.stringify({
          to_phone: toPhone,
          lead_phone: fromPhone,
          subject,
          description,
          call_id: callId,
          priority: "normal",
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("[ARTIFACT] tool route success", {
          callId,
          ticketId: result.ticket?.id,
        });
        
        // Canonical event: TOOL_RESULT
        try {
          console.info(JSON.stringify({
            tag: "[TOOL_RESULT]",
            ts: Date.now(),
            call_id: callId,
            org_id: orgId ?? null,
            source: "vapi_webhook",
            tool: "create-ticket",
            ok: result.ok ?? true,
            error: result.error?.code ?? null,
            artifact_id: result.artifact?.id ?? result.ticket_id ?? null,
            artifact_type: result.artifact?.type ?? "ticket",
          }));
        } catch (logErr) {
          // Never throw from logging
        }
        
        return; // Success
      }

      // Tool route failed, log and fall back
      const errorText = await response.text().catch(() => "unknown error");
      
      // Canonical event: TOOL_RESULT (failure)
      try {
        let errorData: any = { error: { code: "TOOL_ROUTE_FAILED" } };
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Use default error
        }
        console.info(JSON.stringify({
          tag: "[TOOL_RESULT]",
          ts: Date.now(),
          call_id: callId,
          org_id: orgId ?? null,
          source: "vapi_webhook",
          tool: "create-ticket",
          ok: false,
          error: errorData?.error?.code ?? "TOOL_ROUTE_FAILED",
        }));
      } catch (logErr) {
        // Never throw from logging
      }
      
      console.log("[ARTIFACT] tool route failed, falling back to DB insert", {
        callId,
        orgId,
        status: response.status,
        error: errorText,
      });
      
      // Note: TOOL_RESULT error already logged above
    } catch (fetchErr) {
      console.log("[ARTIFACT] tool route failed, falling back to DB insert", {
        callId,
        orgId,
        error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
      });
    }
  }

  // Direct DB insert (always used for web calls, or as fallback for phone calls)
  try {
    // Check again for idempotency (race condition protection)
    const { data: existing } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existing) {
      console.log("[ARTIFACT] ticket already exists for call_id", {
        callId,
        ticketId: existing.id,
      });
      return;
    }

    // Resolve lead_id by phone (only if caller phone exists)
    let leadId: string | null = null;
    if (hasCallerPhone && fromPhone) {
      leadId = await resolveLeadId(orgId, fromPhone);
      // Note: leadId can be null for web calls - that's acceptable
    }

    // Extract requester_phone and requester_name for phone calls
    // Only set for non-web calls where caller phone exists
    let requesterPhone: string | null = null;
    let requesterName: string | null = null;
    
    if (!isWebCallType && hasCallerPhone && fromPhone) {
      // Use normalized fromPhone as requester_phone (already E.164 format)
      requesterPhone = fromPhone;
      
      // Try to extract customer name from payload if available
      if (rawPayload) {
        const msg = rawPayload?.message;
        const call = msg?.call;
        const customerName = asString(call?.customer?.name) ?? asString(msg?.customer?.name);
        if (customerName && customerName.trim().length > 0) {
          requesterName = customerName.trim();
        }
      }
      
      // Log when we set requester_phone
      console.log("[ARTIFACT] setting requester_phone", {
        vapiCallId,
        callId,
        requester_phone: maskPhoneForLogging(requesterPhone),
        has_requester_name: !!requesterName,
      });
    }

    // Truncate description safely (max 2000 chars)
    let finalDescription = description.length > 2000 ? description.substring(0, 2000) : description;
    
    // Add deterministic marker if not already present (idempotent)
    const deterministicMarker = "[System] created_by=deterministic";
    if (!finalDescription.includes(deterministicMarker)) {
      finalDescription = finalDescription + "\n" + deterministicMarker;
    }

    // Direct insert with minimal safe fields
    const { data: ticket, error: insertErr } = await supabaseAdmin
      .from("tickets")
      .insert({
        org_id: orgId,
        lead_id: leadId, // Can be null for web calls
        call_id: callId,
        subject,
        description: finalDescription,
        status: "open",
        priority: "normal",
        requester_phone: requesterPhone, // Set for phone calls, null for web calls
        requester_name: requesterName, // Set if available in payload, null otherwise
      })
      .select("id")
      .single();

    if (insertErr || !ticket) {
      console.error("[ARTIFACT] DB insert failed:", {
        callId,
        orgId,
        error: insertErr,
      });
      return;
    }

    console.log("[ARTIFACT] DB insert created ticket", {
      callId,
      ticketId: ticket.id,
      isWebCallType,
      hasLeadId: !!leadId,
    });
    
    // Canonical event: ARTIFACT_CREATED
    try {
      console.info(JSON.stringify({
        tag: "[ARTIFACT_CREATED]",
        ts: Date.now(),
        call_id: callId,
        org_id: orgId ?? null,
        source: "vapi_webhook",
        artifact_id: ticket.id,
        artifact_type: "ticket",
      }));
    } catch (logErr) {
      // Never throw from logging
    }
  } catch (insertErr) {
    console.error("[ARTIFACT] DB insert exception:", {
      callId,
      orgId,
      error: insertErr instanceof Error ? insertErr.message : String(insertErr),
    });
    // Never throw - allow call finalization to continue
  }
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
  console.info("[VAPI_WEBHOOK_HIT]", { ts: Date.now() });
  
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
          source: "vapi",
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
              source: "vapi",
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

    // Normalize direction: treat "unknown" as inbound-like (not outbound)
    if (direction === "unknown") {
      console.log("[CALL PIPELINE] normalized direction=unknown -> inbound-like", { vapiCallId });
    }

    console.log("### BEFORE LEASE / DEBUG BLOCK ###");

    // PHASE 2: HARD INSTRUMENTATION - Write debug row on EVERY request (using service role)
    let debugRowId: string | null = null;
    try {
      const { data: debugInsert, error: debugErr } = await supabaseAdmin
        .from("webhook_debug")
        .insert({
          source: "vapi", // REQUIRED: source must always be set to non-null value
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
        console.error("[WEBHOOK] Failed to write webhook_debug row (non-fatal):", {
          error: debugErr,
          vapiCallId,
          eventType,
        });
        // Log error but continue - webhook processing must not fail due to debug logging
      } else {
        debugRowId = debugInsert?.id ?? null;
        console.log("[WEBHOOK] Debug row written", { debugRowId, vapiCallId, eventType });
      }
    } catch (debugException) {
      console.error("[WEBHOOK] Exception writing webhook_debug (non-fatal):", {
        error: debugException,
        vapiCallId,
      });
      // Log exception but continue - webhook processing must not fail due to debug logging
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
    const leadId = direction !== "outbound" ? await resolveLeadId(orgId, from_phone) : null;

    // Detect intent and select persona for inbound calls
    let intent: "support" | "appointment" | "other" | null = null;
    let personaKey: string | null = null;
    
    if (direction !== "outbound" && isNewCall) {
      // Detect intent (for now defaults to "other", can be enhanced later)
      intent = detectCallIntent(body, direction);
      
      // Select persona_key based on language, intent, and entitlements
      // Always returns a safe fallback (support_en) - never throws or returns null
      personaKey = await selectPersonaKeyForCall(agentId, intent, startedAt || new Date().toISOString(), orgId, vapiCallId);
      
      console.log("[WEBHOOK] Intent and persona selected for inbound call:", {
        vapiCallId,
        agentId,
        intent,
        personaKey,
      });
    } else if (!isNewCall) {
      // For existing calls, fetch intent and persona_key from existing call record
      // to ensure we don't overwrite them
      try {
        const { data: existing } = await supabaseAdmin
          .from("calls")
          .select("intent, persona_key")
          .eq("vapi_call_id", vapiCallId)
          .maybeSingle<{ intent: string | null; persona_key: string | null }>();
        
        if (existing) {
          intent = (existing.intent as "support" | "appointment" | "other") || null;
          personaKey = existing.persona_key;
        }
      } catch (fetchErr) {
        console.error("[WEBHOOK] Failed to fetch existing intent/persona_key:", fetchErr);
        // Continue - we'll try to set it if it's an inbound call
      }
      
      // If call exists but missing persona_key, try to select it (safety fallback)
      // Always returns a safe fallback (support_en) - never throws or returns null
      if (!personaKey && direction !== "outbound") {
        personaKey = await selectPersonaKeyForCall(agentId, intent, startedAt || new Date().toISOString(), orgId, vapiCallId);
      }
    }

    // duration: final eventte daha doğru (summary_table.minutes vs / call.durationSeconds)
    const durationSeconds =
      safeNumber(call?.durationSeconds) ??
      safeNumber(msg?.durationSeconds) ??
      null;

    // Check if call exists by (org_id + vapi_call_id) for deterministic correlation
    // This ensures webcall/event and vapi webhook update the SAME row
    // Also fetch call_type and raw_payload for deep-merge
    let wasExisting = false;
    let existingCallId: string | null = null;
    let existingCallType: string | null = null;
    let existingRawPayload: any = null;
    try {
      const { data: existingCheck } = await supabaseAdmin
        .from("calls")
        .select("id, call_type, raw_payload")
        .eq("org_id", orgId)
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle<{ id: string; call_type: string | null; raw_payload: any }>();
      wasExisting = !!existingCheck;
      existingCallId = existingCheck?.id ?? null;
      existingCallType = existingCheck?.call_type ?? null;
      existingRawPayload = existingCheck?.raw_payload ?? null;
    } catch {
      // Ignore check errors, proceed with upsert
    }

    // Detect if this is a webcall:
    // 1. Existing call has call_type='webcall'
    // 2. OR no phone numbers (from_phone and to_phone are both null)
    const isWebcall = existingCallType === 'webcall' || (from_phone === null && to_phone === null);

    // Deep-merge raw_payload: preserve existing meta, ensure channel='web' for webcalls
    // Attach webhook payload under raw_payload.vapi_webhook
    const mergedRawPayload = (() => {
      const existing = existingRawPayload && typeof existingRawPayload === 'object' ? existingRawPayload : {};
      const existingMeta = existing.meta && typeof existing.meta === 'object' ? existing.meta : {};
      
      // Ensure meta.channel='web' for webcalls
      const mergedMeta = { ...existingMeta };
      if (isWebcall) {
        mergedMeta.channel = 'web';
      }
      
      // Deep-merge: preserve existing fields, add vapi_webhook with current payload
      return {
        ...existing,
        meta: mergedMeta,
        vapi_webhook: body, // Attach webhook payload without clobbering meta
      };
    })();

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
      raw_payload: mergedRawPayload, // Deep-merged, preserves existing meta
      call_type: isWebcall ? 'webcall' : undefined, // Set call_type='webcall' for webcalls
      outcome: asString(call?.status) ?? asString(msg?.status) ?? undefined,
      transcript: undefined, // transcript'i final eventte daha iyi yaz
      intent: intent ?? undefined,
      persona_key: personaKey ?? undefined,
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

    // If call exists, UPDATE it instead of creating a new row
    // This unifies webcall/event and vapi webhook to use the same row
    let upsertedCall: { id: string; org_id: string; agent_id: string; ended_at: string | null } | null = null;
    let upsertErr: any = null;

    if (wasExisting && existingCallId) {
      // UPDATE existing row (do not create new row)
      const updatePayload = { ...compact(baseUpsert) };
      delete (updatePayload as any).id; // Don't update id

      const { data: updateResult, error: updateError } = await supabaseAdmin
        .from("calls")
        .update(updatePayload)
        .eq("vapi_call_id", vapiCallId)
        .eq("org_id", orgId)
        .select("id, org_id, agent_id, ended_at")
        .single();

      upsertedCall = updateResult;
      upsertErr = updateError;

      if (!upsertErr) {
        console.info("[CALL][MERGED]", {
          vapiCallId,
          orgId,
          operation: "updated_existing",
          call_id: existingCallId,
        });
        
        // Canonical log for webhook merge (once per finalize)
        if (isWebcall) {
          try {
            console.info(JSON.stringify({
              tag: "[CALL][WEBHOOK_MERGE_OK]",
              ts: Date.now(),
              vapi_call_id: vapiCallId,
              call_id: existingCallId,
              call_type: "webcall",
              org_id: orgId,
            }));
          } catch (logErr) {
            // Never throw from logging
          }
        }
      }
    } else {
      // INSERT new row (call doesn't exist yet)
      const upsertPayload = { ...compact(baseUpsert) };
      delete (upsertPayload as any).id; // Let DB handle id generation

      const { data: upsertResult, error: upsertError } = await supabaseAdmin
        .from("calls")
        .upsert(upsertPayload, { onConflict: "vapi_call_id" })
        .select("id, org_id, agent_id, ended_at")
        .single();

      upsertedCall = upsertResult;
      upsertErr = upsertError;

      if (!upsertErr && !wasExisting) {
        console.info("[CALL][MISSING_PRECALL_ROW]", {
          vapiCallId,
          orgId,
          operation: "created_new",
          note: "No pre-existing row found from webcall/event",
        });
      }
    }

    // Handle 23505 duplicate key error: fetch existing row and continue
    if (upsertErr && upsertErr.code === "23505") {
      console.warn("[WEBHOOK] Upsert hit duplicate key (23505), fetching existing row:", {
        vapiCallId,
        orgId,
        constraint: upsertErr.constraint ?? "unknown",
      });

      try {
        const { data: existingCall, error: fetchErr } = await supabaseAdmin
          .from("calls")
          .select("id, org_id, agent_id, ended_at")
          .eq("vapi_call_id", vapiCallId)
          .maybeSingle<{ id: string; org_id: string; agent_id: string; ended_at: string | null }>();

        if (!fetchErr && existingCall) {
          upsertedCall = existingCall;
          upsertErr = null; // Clear error - we have the row
        }
      } catch (fetchErr) {
        console.error("[WEBHOOK] Failed to fetch existing call after 23505:", {
          vapiCallId,
          error: fetchErr,
        });
      }
    }

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
      
      // Update debug row with error (never throw, log and continue)
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
      
      // Continue processing even if upsert failed (non-blocking)
      // This allows the webhook to complete and return 200
      console.warn("[WEBHOOK] Call upsert failed, continuing processing", {
        vapiCallId,
        orgId,
        error: upsertErr.message,
      });
    } else {
      // Log whether we inserted or updated
      console.log("[CALL UPSERT]", {
        vapiCallId,
        orgId,
        operation: wasExisting ? "updated" : "inserted",
        callId: upsertedCall?.id,
      });
    }

    // PHASE 4: Use org_id and agent_id from the ACTUAL calls row (more reliable)
    const actualOrgId = upsertedCall?.org_id ?? orgId;
    const actualAgentId = upsertedCall?.agent_id ?? agentId;
    const actualEndedAt = upsertedCall?.ended_at;
    
    // Canonical event: CALL_START (when call is first seen/upserted)
    if (isNewCall && upsertedCall?.id) {
      try {
        console.info(JSON.stringify({
          tag: "[CALL_START]",
          ts: Date.now(),
          call_id: upsertedCall.id,
          org_id: actualOrgId ?? null,
          source: "vapi_webhook",
          vapi_call_id: vapiCallId,
          direction: direction ?? null,
        }));
      } catch (logErr) {
        // Never throw from logging
      }
    }
    
    // Canonical event: INTENT_DETECTED (when intent/persona is decided for new inbound calls)
    if (isNewCall && upsertedCall?.id && direction !== "outbound" && intent) {
      try {
        console.info(JSON.stringify({
          tag: "[INTENT_DETECTED]",
          ts: Date.now(),
          call_id: upsertedCall.id,
          org_id: actualOrgId ?? null,
          source: "vapi_webhook",
          vapi_call_id: vapiCallId,
          intent: intent ?? null,
          persona_key: personaKey ?? null,
          intent_confidence: null, // Will be computed later
        }));
      } catch (logErr) {
        // Never throw from logging
      }
    }

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

          // Reject call if limit reached, org inactive, or RPC returned no row
          if (leaseResult.reason === "limit_reached" || leaseResult.reason === "org_inactive" || leaseResult.reason === "rpc_no_row") {
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

      // Ensure persona_key and intent exist before allowing call to complete
      let finalPersonaKey = personaKey;
      let finalIntent = intent;
      
      // Fetch existing persona_key and intent from call record
      let existingIntent: "support" | "appointment" | "other" | null = null;
      try {
        const { data: existing } = await supabaseAdmin
          .from("calls")
          .select("persona_key, intent")
          .eq("vapi_call_id", vapiCallId)
          .maybeSingle<{ persona_key: string | null; intent: string | null }>();
        
        finalPersonaKey = existing?.persona_key ?? finalPersonaKey;
        existingIntent = (existing?.intent as "support" | "appointment" | "other") || null;
        finalIntent = existingIntent || finalIntent;
      } catch (fetchErr) {
        console.error("[WEBHOOK] Failed to fetch existing persona_key/intent:", fetchErr);
      }
      
      // Normalize intent: default to 'other' if missing (idempotent - only set if missing)
      if (!finalIntent && direction !== "outbound") {
        finalIntent = "other";
        console.log("[CALL PIPELINE] intent missing -> defaulted to other", { vapiCallId });
      }
      
      // Reselect persona_key if missing (idempotent - only set if missing)
      // Always returns a safe fallback (support_en) - never throws or returns null
      if (!finalPersonaKey && direction !== "outbound" && actualAgentId) {
        finalPersonaKey = await selectPersonaKeyForCall(
          actualAgentId,
          finalIntent,
          startedAt || new Date().toISOString(),
          actualOrgId,
          vapiCallId
        );
        console.log("[CALL PIPELINE] persona_key missing -> reselected", { vapiCallId, personaKey: finalPersonaKey });
      }

      // Always update: ended_at, outcome, duration_seconds
      // Only update cost_usd if valid (do NOT overwrite with null or 0)
      // Only update transcript if present (do not wipe existing transcript)
      // Ensure intent and persona_key are set (idempotent - only set if we have values)
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
        intent: finalIntent ?? undefined, // Set intent if we normalized it
        persona_key: finalPersonaKey ?? undefined, // Set persona_key if we reselected it
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

      // DEMO GUARDRAIL: Check for web call abuse (duration + off-topic content)
      // Only apply to web calls (webCall type or daily transport provider)
      // Must NOT affect phone calls (inboundPhoneCall/outboundPhoneCall)
      if (updated?.[0]?.id && actualOrgId && isWebCall(body)) {
        try {
          const callDuration = finalDuration ?? null;
          const callTranscript = transcript ?? null;
          const callStartedAt = startedAt;
          const callEndedAt = finalEndedAt;
          
          let abuseReason: string | null = null;
          
          // Check duration
          if (exceedsDemoDuration(callStartedAt, callEndedAt, callDuration)) {
            abuseReason = `Call duration exceeded 5-minute demo limit (duration: ${callDuration ?? 'calculated'} seconds)`;
          }
          
          // Check off-topic content
          if (hasOffTopicContent(callTranscript)) {
            abuseReason = abuseReason 
              ? `${abuseReason}; Off-topic content detected in transcript`
              : "Off-topic content detected in transcript (recipes, cooking, gym plans, etc.)";
          }
          
          if (abuseReason) {
            console.log("[DEMO GUARDRAIL] Abuse detected for web call:", {
              vapiCallId,
              callId: updated[0].id,
              orgId: actualOrgId,
              reason: abuseReason,
              duration: callDuration,
              transcriptLength: callTranscript?.length ?? 0,
            });
            
            // Create abuse ticket
            await createAbuseTicket(
              updated[0].id,
              actualOrgId,
              from_phone,
              to_phone,
              callTranscript,
              abuseReason
            );
          }
        } catch (guardrailErr) {
          console.error("[DEMO GUARDRAIL] Exception in demo guardrail:", {
            vapiCallId,
            callId: updated?.[0]?.id,
            orgId: actualOrgId,
            error: guardrailErr,
          });
          // Never throw - allow call finalization to continue
        }
      }

      // TASK 3: Check guardrails BEFORE artifact routing
      let guardrailResult: { forceTicket: boolean; setPartial: boolean; reason?: string } | null = null;
      if (updated?.[0]?.id && actualOrgId && (direction !== "outbound" || isWebCall(body))) {
        try {
          // Load call row for guardrail check
          const { data: callRowForGuardrails } = await supabaseAdmin
            .from("calls")
            .select("id, org_id, from_phone, to_phone, transcript, raw_payload")
            .eq("id", updated[0].id)
            .maybeSingle<{
              id: string;
              org_id: string | null;
              from_phone: string | null;
              to_phone: string | null;
              transcript: string | null;
              raw_payload: any;
            }>();

          if (callRowForGuardrails?.id && callRowForGuardrails.org_id) {
            const userTurnCount = countUserTurns(callRowForGuardrails.transcript || transcript);
            
            guardrailResult = await checkCallGuardrails({
              callId: callRowForGuardrails.id,
              orgId: callRowForGuardrails.org_id,
              transcript: callRowForGuardrails.transcript || transcript,
              fromPhone: callRowForGuardrails.from_phone,
              toPhone: callRowForGuardrails.to_phone,
              rawPayload: callRowForGuardrails.raw_payload || body,
              userTurnCount,
            });
            
            // Canonical event: FALLBACK_TRIGGERED
            if (guardrailResult?.forceTicket) {
              try {
                console.info(JSON.stringify({
                  tag: "[FALLBACK_TRIGGERED]",
                  ts: Date.now(),
                  call_id: callRowForGuardrails.id,
                  org_id: callRowForGuardrails.org_id ?? null,
                  source: "vapi_webhook",
                  reason: guardrailResult.reason ?? "guardrail",
                  slot: guardrailResult.reason?.includes("REPEAT_SLOT") ? (guardrailResult.reason.includes("phone") ? "phone" : "email") : null,
                }));
              } catch (logErr) {
                // Never throw from logging
              }
            }
          }
        } catch (guardrailErr) {
          console.error("[GUARDRAIL] Exception in guardrail check:", {
            callId: updated?.[0]?.id,
            orgId: actualOrgId,
            error: guardrailErr,
          });
          // Never throw - continue with normal artifact routing
        }
      }

      // TASK 3: Ensure artifact (ticket/appointment) exists for inbound calls and web calls
      // Treat webCall as inbound-equivalent for routing (direction may be 'unknown' for web calls)
      const shouldRunArtifactRouting = (direction !== "outbound" || isWebCall(body)) && updated?.[0]?.id && actualOrgId;
      
      if (shouldRunArtifactRouting) {
        // Log if we're routing for webCall even though direction is not inbound
        if (direction !== "inbound" && isWebCall(body)) {
          console.log("[ARTIFACT] Running artifact routing for webCall (direction:", direction, "):", {
            vapiCallId,
            callId: updated[0].id,
          });
        }

        try {
          // Load call row with all fields needed for artifact routing (including raw_payload for web call detection)
          const { data: callRow } = await supabaseAdmin
            .from("calls")
            .select("id, org_id, intent, from_phone, to_phone, transcript, raw_payload")
            .eq("id", updated[0].id)
            .maybeSingle<{
              id: string;
              org_id: string | null;
              intent: string | null;
              from_phone: string | null;
              to_phone: string | null;
              transcript: string | null;
              raw_payload: any;
            }>();

          if (callRow?.id && callRow.org_id) {
            // Deterministic intent fallback: appointment → appointment, everything else → support
            const rawIntent = (callRow.intent as "support" | "appointment" | "other") || null;
            const finalIntent = rawIntent === "appointment" ? "appointment" : "support";
            
            if (finalIntent === "appointment") {
              // Appointment intent → create appointment (NOT ticket)
              await ensureAppointmentForCall(
                callRow.id,
                callRow.org_id,
                callRow.transcript || transcript,
                callRow.from_phone
              );
            } else {
              // Support/other intent → create ticket
              // Canonical event: FALLBACK_TRIGGERED (platform guarantee fallback)
              try {
                console.info(JSON.stringify({
                  tag: "[FALLBACK_TRIGGERED]",
                  ts: Date.now(),
                  call_id: callRow.id,
                  org_id: callRow.org_id ?? null,
                  source: "vapi_webhook",
                  reason: "platform_guarantee",
                }));
              } catch (logErr) {
                // Never throw from logging
              }
              
              await ensureTicketForCall(
                callRow.id,
                callRow.org_id,
                callRow.from_phone,
                callRow.to_phone,
                callRow.transcript || transcript,
                callRow.raw_payload || body,
                extractCallId(callRow.raw_payload || body) ?? undefined
              );
            }
          }
        } catch (artifactErr) {
          console.error("[ARTIFACT] Failed to ensure artifact for call:", {
            callId: updated?.[0]?.id,
            orgId: actualOrgId,
            error: artifactErr,
          });
          // Never throw - allow call finalization to continue
        }
      }

      // TASK 4: Compute and update intent_confidence + completion_state
      if (updated?.[0]?.id && actualOrgId) {
        try {
          // Load call row to get started_at and ended_at for duration calculation
          const { data: callRowForScoring } = await supabaseAdmin
            .from("calls")
            .select("id, org_id, intent, started_at, ended_at, transcript, duration_seconds, from_phone, raw_payload")
            .eq("id", updated[0].id)
            .maybeSingle<{
              id: string;
              org_id: string | null;
              intent: string | null;
              started_at: string | null;
              ended_at: string | null;
              transcript: string | null;
              duration_seconds: number | null;
              from_phone: string | null;
              raw_payload: any;
            }>();

          if (callRowForScoring?.id && callRowForScoring.org_id) {
            // Compute durationSeconds (prefer DB, fallback to payload)
            let computedDuration: number | null = callRowForScoring.duration_seconds;
            if (computedDuration === null && callRowForScoring.started_at && callRowForScoring.ended_at) {
              const startMs = new Date(callRowForScoring.started_at).getTime();
              const endMs = new Date(callRowForScoring.ended_at).getTime();
              if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                computedDuration = Math.round((endMs - startMs) / 1000);
              }
            }
            // Fallback to finalDuration from payload if still null
            if (computedDuration === null) {
              computedDuration = finalDuration;
            }

            // Count user turns from transcript
            const userTurnCount = countUserTurns(callRowForScoring.transcript || transcript);

            // Compute intent_confidence
            const intent = (callRowForScoring.intent as "support" | "appointment" | "other") || null;
            const intentConfidence = computeIntentConfidence(
              intent,
              callRowForScoring.transcript || transcript,
              computedDuration,
              userTurnCount
            );

            // Query for ticket/appointment existence and check for deterministic markers (AFTER deterministic guarantee)
            let ticketCreated = false;
            let appointmentCreated = false;
            let deterministicTicket = false;
            let deterministicAppointment = false;
            
            try {
              const { data: ticket } = await supabaseAdmin
                .from("tickets")
                .select("id, description")
                .eq("call_id", callRowForScoring.id)
                .limit(1)
                .maybeSingle<{ id: string; description: string | null }>();
              
              ticketCreated = !!ticket;
              if (ticket && ticket.description) {
                deterministicTicket = ticket.description.includes("[System] created_by=deterministic");
              }
            } catch (ticketErr) {
              console.warn("[SCORING] Failed to check ticket existence:", {
                callId: callRowForScoring.id,
                error: ticketErr instanceof Error ? ticketErr.message : String(ticketErr),
              });
            }
            
            try {
              const { data: appointment } = await supabaseAdmin
                .from("appointments")
                .select("id, notes")
                .eq("call_id", callRowForScoring.id)
                .limit(1)
                .maybeSingle<{ id: string; notes: string | null }>();
              
              appointmentCreated = !!appointment;
              if (appointment && appointment.notes) {
                deterministicAppointment = appointment.notes.includes("[System] created_by=deterministic");
              }
            } catch (appointmentErr) {
              console.warn("[SCORING] Failed to check appointment existence:", {
                callId: callRowForScoring.id,
                error: appointmentErr instanceof Error ? appointmentErr.message : String(appointmentErr),
              });
            }

            // Detect tool usage and truncated agent line
            const toolUsed = detectToolUsed(callRowForScoring.raw_payload || body);
            const truncatedAgentLastLine = detectTruncatedAgentLastLine(callRowForScoring.transcript || transcript);

            // Check guardrail result for missing contact at finalization (GR-2)
            let finalGuardrailPartial = false;
            if (guardrailResult?.setPartial) {
              finalGuardrailPartial = true;
            } else {
              // GR-2: Missing contact check at finalization
              // Check if ticket exists but has no requester_phone or requester_email
              if (ticketCreated) {
                try {
                  const { data: ticket } = await supabaseAdmin
                    .from("tickets")
                    .select("requester_phone, requester_email")
                    .eq("call_id", callRowForScoring.id)
                    .maybeSingle<{ requester_phone: string | null; requester_email: string | null }>();
                  
                  if (ticket) {
                    const hasPhone = !!ticket.requester_phone && ticket.requester_phone.trim().length > 0;
                    const hasEmail = !!ticket.requester_email && ticket.requester_email.trim().length > 0;
                    if (!hasPhone && !hasEmail) {
                      console.info("[GUARDRAIL][MISSING_CONTACT]", {
                        call_id: callRowForScoring.id,
                      });
                      finalGuardrailPartial = true;
                    }
                  }
                } catch (ticketCheckErr) {
                  // Ignore - continue with normal completion_state
                }
              }
            }

            // Infer completion_state using new helper
            let completionState = inferCompletionState(
              intent,
              computedDuration,
              callRowForScoring.transcript || transcript,
              userTurnCount,
              toolUsed,
              truncatedAgentLastLine,
              deterministicTicket,
              deterministicAppointment,
              ticketCreated,
              appointmentCreated
            );

            // Override completion_state to "partial" if guardrail triggered
            if (finalGuardrailPartial) {
              completionState = "partial";
            }

            // Invariant enforcement: partial requires artifact (ticket/appointment)
            // If completion_state would be "partial" but NO artifact exists, set to "abandoned"
            if (completionState === "partial" && !ticketCreated && !appointmentCreated) {
              try {
                console.info(JSON.stringify({
                  tag: "[CALL_COMPLETED][INVARIANT_CORRECTION]",
                  ts: Date.now(),
                  call_id: callRowForScoring.id,
                  org_id: callRowForScoring.org_id ?? null,
                  from: "partial",
                  to: "abandoned",
                  reason: "NO_ARTIFACT",
                }));
              } catch (logErr) {
                // Never throw from logging
              }
              completionState = "abandoned";
            }

            // Update calls row with intent_confidence and completion_state
            const { error: scoringErr } = await supabaseAdmin
              .from("calls")
              .update({
                intent_confidence: intentConfidence,
                completion_state: completionState,
              })
              .eq("id", callRowForScoring.id);

            if (scoringErr) {
              console.warn("[SCORING] Failed to update intent_confidence/completion_state:", {
                callId: callRowForScoring.id,
                orgId: callRowForScoring.org_id,
                error: scoringErr.message,
              });
            } else {
              console.log("[COMPLETION]", {
                vapiCallId,
                callId: callRowForScoring.id,
                durationSeconds: computedDuration,
                userTurns: userTurnCount,
                toolUsed,
                truncatedAgentLastLine,
                deterministicTicket,
                deterministicAppointment,
                completion_state: completionState,
              });
              console.log("[SCORING] Updated intent_confidence and completion_state:", {
                callId: callRowForScoring.id,
                intent_confidence: intentConfidence,
                completion_state: completionState,
                durationSeconds: computedDuration,
                userTurnCount: userTurnCount,
              });
              
              // Canonical event: CALL_COMPLETED
              try {
                console.info(JSON.stringify({
                  tag: "[CALL_COMPLETED]",
                  ts: Date.now(),
                  call_id: callRowForScoring.id,
                  org_id: callRowForScoring.org_id ?? null,
                  source: "vapi_webhook",
                  vapi_call_id: vapiCallId,
                  completion_state: completionState,
                  intent: intent ?? null,
                  intent_confidence: intentConfidence,
                  duration_seconds: computedDuration,
                }));
              } catch (logErr) {
                // Never throw from logging
              }
            }
          }
        } catch (scoringErr) {
          console.warn("[SCORING] Exception computing intent_confidence/completion_state:", {
            callId: updated?.[0]?.id,
            orgId: actualOrgId,
            error: scoringErr instanceof Error ? scoringErr.message : String(scoringErr),
          });
          // Never throw - allow call finalization to continue
        }
      }

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

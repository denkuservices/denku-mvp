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
 * Ensure artifact (ticket/appointment) exists for a call based on intent.
 * Idempotent: checks for existing artifacts by call_id before creating.
 * 
 * Routing logic:
 * - intent = 'appointment': create ticket labeled as appointment request (if appointment doesn't exist)
 * - intent in ('support','other'): ensure ticket exists
 * 
 * Uses POST /api/tools/create-ticket route when possible, falls back to direct DB insert if needed.
 */
async function ensureArtifactForCall(
  callId: string,
  orgId: string,
  intent: "support" | "appointment" | "other" | null,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null
): Promise<void> {
  try {
    // Normalize intent: default to 'other' if null
    const normalizedIntent = intent ?? "other";
    
    // Idempotency: Check if ticket already exists
    const { data: existingTicket } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingTicket) {
      console.log("[ARTIFACT] Ticket already exists for call:", { callId, ticketId: existingTicket.id });
      return; // Already have ticket, nothing to do
    }

    // Idempotency: Check if appointment already exists
    const { data: existingAppointment } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingAppointment) {
      console.log("[ARTIFACT] Appointment already exists for call:", { callId, appointmentId: existingAppointment.id });
      return; // Already have appointment, nothing to do
    }

    // Routing logic (using normalized intent)
    if (normalizedIntent === "appointment") {
      // If appointment exists (checked above), we're done
      // Otherwise, create a ticket labeled as appointment request
      await createTicketForCall(callId, orgId, fromPhone, toPhone, transcript, "appointment");
    } else {
      // support, other, or any other value -> ensure ticket exists
      await createTicketForCall(callId, orgId, fromPhone, toPhone, transcript, "support");
    }
  } catch (err) {
    console.error("[ARTIFACT] Exception ensuring artifact for call:", { callId, orgId, error: err });
    // Never throw - allow call finalization to continue
  }
}

/**
 * Create ticket for a call via tool route or direct DB insert fallback.
 * Idempotent: checks call_id before creating.
 */
async function createTicketForCall(
  callId: string,
  orgId: string,
  fromPhone: string | null,
  toPhone: string | null,
  transcript: string | null,
  intentType: "appointment" | "support"
): Promise<void> {
  // Validate required fields
  if (!toPhone || !fromPhone) {
    console.error("[ARTIFACT] Missing phone numbers for ticket creation:", { callId, toPhone, fromPhone });
    return;
  }

  const subject = intentType === "appointment" ? "Appointment Request" : "Support Request";
  const description = transcript || `Call artifact created for ${intentType} intent.`;

  // Try tool route first
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const toolSecret = process.env.DENKU_TOOL_SECRET || "";

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
      console.log("[ARTIFACT] Ticket created via tool route:", { callId, ticketId: result.ticket?.id });
      return; // Success
    }

    // Tool route failed, log and fall back
    const errorText = await response.text().catch(() => "unknown error");
    console.error("[ARTIFACT] Tool route failed, falling back to direct insert:", {
      callId,
      orgId,
      status: response.status,
      error: errorText,
    });
  } catch (fetchErr) {
    console.error("[ARTIFACT] Tool route exception, falling back to direct insert:", {
      callId,
      orgId,
      error: fetchErr,
    });
  }

  // Fallback: Direct DB insert (idempotent by call_id)
  try {
    // Check again for idempotency (race condition protection)
    const { data: existing } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existing) {
      console.log("[ARTIFACT] Ticket already exists (race condition check):", { callId, ticketId: existing.id });
      return;
    }

    // Resolve lead_id by phone (or create if needed)
    const leadId = await resolveLeadId(orgId, fromPhone);
    if (!leadId) {
      console.error("[ARTIFACT] Failed to resolve/create lead for ticket:", { callId, orgId, fromPhone });
      return;
    }

    // Direct insert with minimal safe fields
    const { data: ticket, error: insertErr } = await supabaseAdmin
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

    if (insertErr || !ticket) {
      console.error("[ARTIFACT] Direct insert failed:", { callId, orgId, error: insertErr });
      return;
    }

    console.log("[ARTIFACT] Ticket created via direct insert (fallback):", { callId, ticketId: ticket.id });
  } catch (insertErr) {
    console.error("[ARTIFACT] Direct insert exception:", { callId, orgId, error: insertErr });
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

    // Check if call exists to determine insert vs update
    let wasExisting = false;
    try {
      const { data: existingCheck } = await supabaseAdmin
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .eq("vapi_call_id", vapiCallId)
        .maybeSingle<{ id: string }>();
      wasExisting = !!existingCheck;
    } catch {
      // Ignore check errors, proceed with upsert
    }

    const { data: upsertedCall, error: upsertErr } = await supabaseAdmin
      .from("calls")
      .upsert(compact(baseUpsert), { onConflict: "org_id,vapi_call_id" })
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

      // TASK 3: Ensure artifact (ticket/appointment) exists for inbound calls
      if (direction !== "outbound" && updated?.[0]?.id && actualOrgId) {
        try {
          // Load call row with all fields needed for artifact routing
          const { data: callRow } = await supabaseAdmin
            .from("calls")
            .select("id, org_id, intent, from_phone, to_phone, transcript")
            .eq("id", updated[0].id)
            .maybeSingle<{
              id: string;
              org_id: string | null;
              intent: string | null;
              from_phone: string | null;
              to_phone: string | null;
              transcript: string | null;
            }>();

          if (callRow?.id && callRow.org_id) {
            await ensureArtifactForCall(
              callRow.id,
              callRow.org_id,
              (callRow.intent as "support" | "appointment" | "other") || null,
              callRow.from_phone,
              callRow.to_phone,
              callRow.transcript || transcript
            );
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

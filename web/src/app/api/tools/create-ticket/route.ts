import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";

function checkAuth(request: NextRequest): boolean {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return false;
  
  const incoming = request.headers.get("x-denku-secret");
  if (!incoming) return false;
  
  return incoming === expected;
}

function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  return digits.replace(/\D/g, "");
}

async function resolveLeadId(
  orgId: string,
  phone: string | null,
  email: string | null,
  name: string | null
): Promise<string | null> {
  const normalizedPhone = normalizePhone(phone);
  
  // Try phone first
  if (normalizedPhone) {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", normalizedPhone)
      .maybeSingle<{ id: string }>();

    if (existing?.id) return existing.id;

    // Create lead with phone
    const { data: created, error } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: orgId,
        phone: normalizedPhone,
        name: name ?? null,
        email: email ?? null,
        source: "vapi",
        status: "new",
      })
      .select("id")
      .single<{ id: string }>();

    if (!error && created?.id) return created.id;
  }

  // Try email if no phone
  if (email && email.trim().length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("email", email.trim())
      .maybeSingle<{ id: string }>();

    if (existing?.id) return existing.id;

    // Create lead with email
    const { data: created, error } = await supabaseAdmin
      .from("leads")
      .insert({
        org_id: orgId,
        email: email.trim(),
        name: name ?? null,
        phone: normalizedPhone,
        source: "vapi",
        status: "new",
      })
      .select("id")
      .single<{ id: string }>();

    if (!error && created?.id) return created.id;
  }

  return null;
}

/**
 * Derive org_id from requester contact info by looking up existing leads.
 * Returns org_id if found, null otherwise.
 */
async function deriveOrgIdFromContact(
  phone: string | null,
  email: string | null
): Promise<string | null> {
  const normalizedPhone = normalizePhone(phone);
  
  // Try phone first
  if (normalizedPhone) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("org_id")
      .eq("phone", normalizedPhone)
      .maybeSingle<{ org_id: string }>();
    
    if (lead?.org_id) return lead.org_id;
  }
  
  // Try email
  if (email && email.trim().length > 0) {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("org_id")
      .eq("email", email.trim())
      .maybeSingle<{ org_id: string }>();
    
    if (lead?.org_id) return lead.org_id;
  }
  
  return null;
}

/**
 * Create or get a minimal call stub for the given call_id.
 * Returns the call row with org_id, or null if creation fails.
 * 
 * Sets vapi_call_id = `tool:${call_id}` to satisfy NOT NULL constraint.
 */
async function ensureCallStub(
  callId: string,
  orgId: string
): Promise<{ id: string; org_id: string; vapi_call_id: string } | null> {
  try {
    const vapiCallId = `tool:${callId}`;
    
    // Check if call already exists (by id or vapi_call_id)
    const { data: existing } = await supabaseAdmin
      .from("calls")
      .select("id, org_id, vapi_call_id")
      .eq("id", callId)
      .maybeSingle<{ id: string; org_id: string; vapi_call_id: string }>();
    
    if (existing) {
      return existing;
    }
    
    // Also check by vapi_call_id (in case it was created with different id)
    const { data: existingByVapi } = await supabaseAdmin
      .from("calls")
      .select("id, org_id, vapi_call_id")
      .eq("vapi_call_id", vapiCallId)
      .maybeSingle<{ id: string; org_id: string; vapi_call_id: string }>();
    
    if (existingByVapi) {
      return existingByVapi;
    }
    
    // Create minimal call stub with deterministic vapi_call_id
    const now = new Date().toISOString();
    const { data: created, error } = await supabaseAdmin
      .from("calls")
      .insert({
        id: callId, // Use the provided UUID as the primary key
        vapi_call_id: vapiCallId, // Required NOT NULL field: deterministic value
        org_id: orgId,
        intent: "support",
        completion_state: "partial",
        call_type: "tool",
        direction: "inbound",
        started_at: now,
        updated_at: now,
      })
      .select("id, org_id, vapi_call_id")
      .single<{ id: string; org_id: string; vapi_call_id: string }>();
    
    if (error || !created) {
      // If insert fails (e.g., due to constraint), try to fetch again (race condition)
      const { data: raceExisting } = await supabaseAdmin
        .from("calls")
        .select("id, org_id, vapi_call_id")
        .or(`id.eq.${callId},vapi_call_id.eq.${vapiCallId}`)
        .maybeSingle<{ id: string; org_id: string; vapi_call_id: string }>();
      
      if (raceExisting) {
        return raceExisting;
      }
      
      // Error logged by caller with org_id
      return null;
    }
    
    console.info("[TOOL][CREATE_TICKET][CALL_STUB_UPSERTED]", {
      call_id: callId,
      vapi_call_id: vapiCallId,
    });
    
    return created;
  } catch (err) {
    // Error logged by caller with org_id
    return null;
  }
}

const RequestSchema = z.object({
  call_id: z.string().uuid(),
  description: z.string().min(1),
  requester_phone: z.string().optional().nullable(),
  requester_email: z.string().email().optional().nullable(),
  requester_name: z.string().optional().nullable(),
}).passthrough();

export async function POST(request: NextRequest) {
  try {
    // Collect diagnostic info before auth check
    const incomingHeader = request.headers.get("x-denku-secret");
    const hasHeader = incomingHeader !== null;
    const headerLen = incomingHeader?.length ?? 0;
    
    // Check for various possible env var names (never log values)
    const envCandidates = {
      DENKU_TOOL_SECRET: !!process.env.DENKU_TOOL_SECRET,
      DENKU_SECRET: !!process.env.DENKU_SECRET,
      TOOL_SECRET: !!process.env.TOOL_SECRET,
      X_DENKU_SECRET: !!process.env.X_DENKU_SECRET,
    };
    
    const runtime = process.env.VERCEL ? "vercel" : "local";
    
    const isAuthorized = checkAuth(request);
    
    if (!isAuthorized) {
      // Log diagnostic info for auth failure (never log secret values)
      logEvent({
        tag: "[TOOL][AUTH_DIAG]",
        ts: Date.now(),
        stage: "TOOL",
        source: "tool_create_ticket",
        severity: "warn",
        details: {
          has_header: hasHeader,
          header_len: headerLen,
          env_candidates: envCandidates,
          runtime,
          matched: false,
        },
      });
      
      return NextResponse.json({
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          recoverable: false,
        },
      });
    }
    
    // Log diagnostic info for auth success
    logEvent({
      tag: "[TOOL][AUTH_DIAG_OK]",
      ts: Date.now(),
      stage: "TOOL",
      source: "tool_create_ticket",
      details: {
        has_header: hasHeader,
        header_len: headerLen,
        env_candidates: envCandidates,
        runtime,
        matched: true,
      },
    });

    // Parse body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({
        ok: false,
        error: {
          code: "INVALID_JSON",
          recoverable: false,
        },
      });
    }

    // Validate schema
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      const callIdFromBody = body && typeof body === "object" && "call_id" in body ? String(body.call_id) : null;
      logEvent({
        tag: "[TOOL][VALIDATION_FAIL]",
        ts: Date.now(),
        stage: "TOOL",
        source: "tool_create_ticket",
        call_id: callIdFromBody,
        severity: "warn",
        details: {
          errors: parsed.error.issues.map(e => ({ path: e.path.join('.'), message: e.message })),
        },
      });
      return NextResponse.json({
        ok: false,
        error: {
          code: "VALIDATION_FAILED",
          recoverable: false,
          details: parsed.error.flatten(),
        },
      });
    }

    const input = parsed.data;
    const callId = input.call_id;

    // Look up call to get org_id
    let { data: callData, error: callErr } = await supabaseAdmin
      .from("calls")
      .select("id, org_id")
      .eq("id", callId)
      .maybeSingle<{ id: string; org_id: string | null }>();

    let orgId: string | null = null;
    let callStubFailed = false;
    let warning: { code: string } | undefined = undefined;

    // If call exists, use its org_id
    if (callData?.org_id) {
      orgId = callData.org_id;
    } else {
      // Call doesn't exist - try to derive org_id and create stub
      console.info("[TOOL][CREATE_TICKET][CALL_STUB_ATTEMPT]", {
        call_id: callId,
      });

      // Derive org_id from requester contact info
      const derivedOrgId = await deriveOrgIdFromContact(
        input.requester_phone ?? null,
        input.requester_email ?? null
      );
      
      if (!derivedOrgId) {
        logEvent({
          tag: "[TOOL][ERROR]",
          ts: Date.now(),
          stage: "TOOL",
          source: "tool_create_ticket",
          call_id: callId,
          severity: "error",
          details: {
            code: "ORG_ID_REQUIRED",
            message: "Cannot derive org_id from contact info",
          },
        });
        return NextResponse.json({
          ok: false,
          error: {
            code: "ORG_ID_REQUIRED",
            recoverable: false,
            details: {
              message: "Call not found and cannot derive org_id from requester contact info. Please ensure requester_phone or requester_email matches an existing lead.",
            },
          },
        });
      }
      
      orgId = derivedOrgId;
      
      // Log auth success now that we have org_id
      logEvent({
        tag: "[TOOL][AUTH_OK]",
        ts: Date.now(),
        stage: "TOOL",
        source: "tool_create_ticket",
        org_id: derivedOrgId,
        call_id: callId,
      });
      
      // Attempt to create call stub (best effort)
      const stub = await ensureCallStub(callId, derivedOrgId);
      if (stub) {
        logEvent({
          tag: "[TOOL][CALL_STUB_UPSERTED]",
          ts: Date.now(),
          stage: "TOOL",
          source: "tool_create_ticket",
          org_id: derivedOrgId,
          call_id: callId,
          vapi_call_id: `tool:${callId}`,
        });
        callData = stub;
      } else {
        // Stub creation failed, but we have org_id - proceed with ticket creation anyway
        callStubFailed = true;
        logEvent({
          tag: "[TOOL][CALL_STUB_FAILED_FALLBACK_TICKET]",
          ts: Date.now(),
          stage: "TOOL",
          source: "tool_create_ticket",
          org_id: derivedOrgId,
          call_id: callId,
          severity: "warn",
        });
        warning = { code: "CALL_MISSING_TICKET_CREATED" };
      }
    }

    if (!orgId) {
      logEvent({
        tag: "[TOOL][ERROR]",
        ts: Date.now(),
        stage: "TOOL",
        source: "tool_create_ticket",
        call_id: callId,
        severity: "error",
        details: {
          code: "ORG_ID_REQUIRED",
          message: "No org_id available",
        },
      });
      return NextResponse.json({
        ok: false,
        error: {
          code: "ORG_ID_REQUIRED",
          recoverable: false,
          details: { call_id: callId },
        },
      });
    }

    // Idempotency: Check if ticket already exists
    const { data: existingTicket } = await supabaseAdmin
      .from("tickets")
      .select("id")
      .eq("call_id", callId)
      .maybeSingle<{ id: string }>();

    if (existingTicket) {
      console.info("[TOOL][CREATE_TICKET][IDEMPOTENT_HIT]", {
        call_id: callId,
        ticket_id: existingTicket.id,
      });
      return NextResponse.json({
        ok: true,
        artifact: {
          type: "ticket",
          id: existingTicket.id,
        },
      });
    }

    // Resolve lead_id (optional - can be null)
    const leadId = await resolveLeadId(
      orgId,
      input.requester_phone ?? null,
      input.requester_email ?? null,
      input.requester_name ?? null
    );

    // Check for missing contact info (warning, not error)
    const hasPhone = !!input.requester_phone && normalizePhone(input.requester_phone) !== null;
    const hasEmail = !!input.requester_email && input.requester_email.trim().length > 0;
    const hasContact = hasPhone || hasEmail;
    
    // Combine warnings (call stub failure takes precedence)
    if (!warning && !hasContact) {
      warning = { code: "MISSING_CONTACT" };
    }

    // Normalize phone for storage
    const normalizedPhone = normalizePhone(input.requester_phone);

    // Create ticket
    const { data: ticket, error: insertErr } = await supabaseAdmin
      .from("tickets")
      .insert({
        org_id: orgId,
        call_id: callId,
        lead_id: leadId,
        subject: "Support Request",
        description: input.description,
        status: "open",
        priority: "normal",
        requester_phone: normalizedPhone,
        requester_email: input.requester_email?.trim() || null,
        requester_name: input.requester_name?.trim() || null,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertErr || !ticket) {
      logEvent({
        tag: "[TOOL][ERROR]",
        ts: Date.now(),
        stage: "TOOL",
        source: "tool_create_ticket",
        org_id: orgId,
        call_id: callId,
        severity: "error",
        details: {
          code: "INSERT_FAILED",
          message: insertErr?.message || "Insert failed",
        },
      });
      return NextResponse.json({
        ok: false,
        error: {
          code: "INSERT_FAILED",
          recoverable: false,
          details: { message: insertErr?.message || "unknown" },
        },
      });
    }

    logEvent({
      tag: "[TOOL][UPSERT_OK]",
      ts: Date.now(),
      stage: "TOOL",
      source: "tool_create_ticket",
      org_id: orgId,
      call_id: callId,
      details: {
        artifact_type: "ticket",
        artifact_id: ticket.id,
        action: "created",
      },
    });

    return NextResponse.json({
      ok: true,
      artifact: {
        type: "ticket",
        id: ticket.id,
      },
      ...(warning && { warning }),
    });
  } catch (err) {
    const callId = "unknown";
    console.info("[TOOL][CREATE_TICKET][ERROR]", {
      call_id: callId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        recoverable: false,
        details: { message: err instanceof Error ? err.message : String(err) },
      },
    });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: { code: "METHOD_NOT_ALLOWED" },
  });
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: { code: "METHOD_NOT_ALLOWED" },
  });
}

export async function PATCH(request: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: { code: "METHOD_NOT_ALLOWED" },
  });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: { code: "METHOD_NOT_ALLOWED" },
  });
}

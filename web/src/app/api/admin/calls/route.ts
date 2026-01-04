import { NextRequest, NextResponse } from 'next/server';
import { requireBasicAuth } from '@/lib/auth/basic';
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Deterministic call outcome computation based ONLY on database state.
 * 
 * NO transcript keyword analysis - outcomes are derived from actual DB records.
 * All queries are org-scoped for multi-tenant safety.
 * 
 * Rule hierarchy (evaluated in order):
 * 1. Meeting Scheduled: appointment record exists linked to call
 *    - Preferred: exact match by call_id
 *    - Fallback: org_id + lead_id + time window (2 hours after call started)
 * 2. Support Request: ticket record exists linked to call
 *    - Preferred: exact match by call_id
 *    - Fallback: org_id + lead_id + time window (2 hours after call started)
 * 3. Dropped Call: ended_at exists AND duration < 20s AND no appointment/ticket
 * 4. Completed: ended_at exists AND no appointment/ticket
 * 5. In Progress: ended_at is null
 */
async function computeCallOutcome(call: {
  id: string;
  org_id: string;
  lead_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
}): Promise<{
  has_appointment: boolean;
  has_ticket: boolean;
  status_derived: 'in_progress' | 'completed' | 'dropped';
  outcome_label: 'Meeting Scheduled' | 'Support Request' | 'Dropped Call' | 'Completed' | 'In progress';
}> {
  const { id: callId, org_id, lead_id, started_at, ended_at, duration_seconds } = call;

  if (!org_id) {
    // No org_id means we can't query appointments/tickets safely
    const isInProgress = !ended_at;
    const isDropped = ended_at && duration_seconds !== null && duration_seconds < 20;
    
    return {
      has_appointment: false,
      has_ticket: false,
      status_derived: isInProgress ? 'in_progress' : isDropped ? 'dropped' : 'completed',
      outcome_label: isInProgress ? 'In progress' : isDropped ? 'Dropped Call' : 'Completed',
    };
  }

  // Time window for fallback linking: 2 hours after call started
  const timeWindowEnd = started_at
    ? new Date(new Date(started_at).getTime() + 2 * 60 * 60 * 1000).toISOString()
    : null;

  // Check for appointments: exact match by call_id (preferred) or time window fallback
  let hasAppointment = false;
  
  // Preferred: exact match by call_id (org-scoped)
  if (callId) {
    const { data: byCallId, error: err1 } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('org_id', org_id)
      .eq('call_id', callId)
      .limit(1)
      .maybeSingle();
    
    if (!err1 && byCallId) {
      hasAppointment = true;
    }
  }

  // Fallback: org_id + lead_id + time window (org-scoped)
  if (!hasAppointment && lead_id && started_at && timeWindowEnd) {
    const { data: byTimeWindow, error: err2 } = await supabaseAdmin
      .from('appointments')
      .select('id')
      .eq('org_id', org_id)
      .eq('lead_id', lead_id)
      .gte('created_at', started_at)
      .lte('created_at', timeWindowEnd)
      .limit(1)
      .maybeSingle();
    
    if (!err2 && byTimeWindow) {
      hasAppointment = true;
    }
  }

  // Check for tickets: exact match by call_id (preferred) or time window fallback
  let hasTicket = false;
  
  // Preferred: exact match by call_id (org-scoped)
  if (callId) {
    const { data: byCallId, error: err3 } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('org_id', org_id)
      .eq('call_id', callId)
      .limit(1)
      .maybeSingle();
    
    if (!err3 && byCallId) {
      hasTicket = true;
    }
  }

  // Fallback: org_id + lead_id + time window (org-scoped)
  if (!hasTicket && lead_id && started_at && timeWindowEnd) {
    const { data: byTimeWindow, error: err4 } = await supabaseAdmin
      .from('tickets')
      .select('id')
      .eq('org_id', org_id)
      .eq('lead_id', lead_id)
      .gte('created_at', started_at)
      .lte('created_at', timeWindowEnd)
      .limit(1)
      .maybeSingle();
    
    if (!err4 && byTimeWindow) {
      hasTicket = true;
    }
  }

  // Determine status and outcome label based on DB state only
  const isInProgress = !ended_at;
  const isDropped = ended_at && duration_seconds !== null && duration_seconds < 20;

  let status_derived: 'in_progress' | 'completed' | 'dropped';
  let outcome_label: 'Meeting Scheduled' | 'Support Request' | 'Dropped Call' | 'Completed' | 'In progress';

  // Rule hierarchy: appointment > ticket > in_progress > dropped > completed
  if (hasAppointment) {
    status_derived = 'completed';
    outcome_label = 'Meeting Scheduled';
  } else if (hasTicket) {
    status_derived = 'completed';
    outcome_label = 'Support Request';
  } else if (isInProgress) {
    status_derived = 'in_progress';
    outcome_label = 'In progress';
  } else if (isDropped) {
    status_derived = 'dropped';
    outcome_label = 'Dropped Call';
  } else {
    status_derived = 'completed';
    outcome_label = 'Completed';
  }

  return {
    has_appointment: hasAppointment,
    has_ticket: hasTicket,
    status_derived,
    outcome_label,
  };
}

export async function GET(request: NextRequest) {
  if (!requireBasicAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' },
    });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org');
  const limit = Number(searchParams.get('limit') ?? '50');

  if (!orgId) {
    return NextResponse.json(
      { error: 'Missing required query param: org' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('id, org_id, vapi_call_id, from_phone, to_phone, started_at, ended_at, outcome, transcript, created_at, lead_id, duration_seconds, agent_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch calls', details: error.message },
      { status: 500 }
    );
  }

  // Compute outcome labels for each call
  const callsWithOutcome = await Promise.all(
    (data ?? []).map(async (call) => {
      const outcome = await computeCallOutcome({
        id: call.id,
        org_id: call.org_id,
        lead_id: call.lead_id ?? null,
        started_at: call.started_at,
        ended_at: call.ended_at,
        duration_seconds: call.duration_seconds,
      });

      return {
        ...call,
        ...outcome,
      };
    })
  );

  return NextResponse.json({ calls: callsWithOutcome });
}

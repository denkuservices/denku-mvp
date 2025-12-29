import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

function normalizePhone(input?: string | null) {
  if (!input) return null;
  const cleaned = input.replace(/[^\d+]/g, '');
  return cleaned || null;
}

function inferIntent(text?: string | null) {
  const t = (text ?? '').toLowerCase();

  const appointmentKeywords = [
    'appointment',
    'book',
    'booking',
    'schedule',
    'reschedule',
    'calendar',
    'meet',
  ];

  const supportKeywords = [
    'support',
    'problem',
    'issue',
    'complaint',
    'broken',
    'refund',
    'return',
    'help',
  ];

  if (appointmentKeywords.some((k) => t.includes(k))) return 'appointment';
  if (supportKeywords.some((k) => t.includes(k))) return 'ticket';
  return 'none';
}

// Minimal schema: require call id + to, keep rest flexible
const VapiWebhookSchema = z
  .object({
    id: z.string().min(1), // vapi call id
    to: z.string().min(3).optional().nullable(),
    from: z.string().min(3).optional().nullable(),
    startedAt: z.string().optional().nullable(),
    endedAt: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    transcript: z.string().optional().nullable(),
  })
  .passthrough();

export async function POST(request: NextRequest) {
  // 1) Shared secret check
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incomingSecret = request.headers.get('x-webhook-secret');
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 2) Parse JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = VapiWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const vapiCallId = payload.id;

  const toPhone = normalizePhone(payload.to);
  const fromPhone = normalizePhone(payload.from);

  if (!toPhone) {
    return NextResponse.json({ error: 'Missing to phone' }, { status: 400 });
  }

  // 3) Tenant mapping via organizations.phone_number
  const { data: org, error: orgErr } = await supabaseServer
    .from('organizations')
    .select('id, phone_number')
    .eq('phone_number', toPhone)
    .single();

  if (orgErr || !org) {
    return NextResponse.json(
      { error: 'Organization not found for phone_number', phone_number: toPhone },
      { status: 404 }
    );
  }

  // 4) Lead lookup/create by from_phone
  let leadId: string | null = null;

  if (fromPhone) {
    const { data: existingLead, error: leadFindErr } = await supabaseServer
      .from('leads')
      .select('id')
      .eq('org_id', org.id)
      .eq('phone', fromPhone)
      .maybeSingle();

    if (leadFindErr) {
      return NextResponse.json(
        { error: 'Failed to lookup lead', details: leadFindErr.message },
        { status: 500 }
      );
    }

    if (existingLead?.id) {
      leadId = existingLead.id;
    } else {
      const { data: newLead, error: leadCreateErr } = await supabaseServer
        .from('leads')
        .insert({
          org_id: org.id,
          name: null,
          phone: fromPhone,
          email: null,
          source: 'vapi',
          status: 'new',
          notes: 'Auto-created from call webhook',
        })
        .select('id')
        .single();

      if (leadCreateErr) {
        return NextResponse.json(
          { error: 'Failed to create lead', details: leadCreateErr.message },
          { status: 500 }
        );
      }

      leadId = newLead.id;
    }
  }

  // 5) Upsert call record
  const startedAt = payload.startedAt ? new Date(payload.startedAt).toISOString() : null;
  const endedAt = payload.endedAt ? new Date(payload.endedAt).toISOString() : null;

  const { data: callRow, error: callErr } = await supabaseServer
    .from('calls')
    .upsert(
      {
        org_id: org.id,
        vapi_call_id: vapiCallId,
        direction: 'inbound',
        from_phone: fromPhone,
        to_phone: toPhone,
        started_at: startedAt,
        ended_at: endedAt,
        outcome: payload.status ?? null,
        transcript: payload.transcript ?? null,
        raw_payload: payload,
      },
      { onConflict: 'org_id,vapi_call_id' }
    )
    .select('id, org_id, vapi_call_id, from_phone, to_phone, started_at, ended_at, outcome, created_at')
    .single();

  if (callErr) {
    return NextResponse.json(
      { error: 'Failed to upsert call', details: callErr.message },
      { status: 500 }
    );
  }

  // 6) Intent automation
  const intent = inferIntent(payload.transcript ?? null);

  let createdTicketId: string | null = null;
  let createdAppointmentId: string | null = null;
// MVP: disable auto-create. Tools handle appointment/ticket creation.
    const AUTO_CREATE_FROM_WEBHOOK = false;
  // Appointment: placeholder time slot (now + 1h)
  if (AUTO_CREATE_FROM_WEBHOOK && intent === 'appointment') {
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data: appt, error: apptErr } = await supabaseServer
      .from('appointments')
      .insert({
        org_id: org.id,
        lead_id: leadId,
        start_at: start,
        end_at: end,
        status: 'scheduled',
        notes: 'Auto-created from call webhook (MVP placeholder time)',
      })
      .select('id')
      .single();

    if (!apptErr && appt?.id) createdAppointmentId = appt.id;
  }

  // Ticket: create support ticket using transcript
  if (AUTO_CREATE_FROM_WEBHOOK && intent === 'ticket') {
    const { data: t, error: tErr } = await supabaseServer
      .from('tickets')
      .insert({
        org_id: org.id,
        lead_id: leadId,
        subject: 'Support request from call',
        status: 'open',
        priority: 'normal',
        description: payload.transcript ?? 'No transcript provided',
      })
      .select('id')
      .single();

    if (!tErr && t?.id) createdTicketId = t.id;
  }

  return NextResponse.json(
    {
      ok: true,
      call: callRow,
      lead_id: leadId,
      intent,
      createdTicketId,
      createdAppointmentId,
    },
    { status: 200 }
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

const CreateAppointmentSchema = z.object({
  org_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  start_at: z.string().datetime(), // ISO string
  end_at: z.string().datetime().optional(),
  status: z.enum(['scheduled', 'canceled', 'completed']).optional(),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateAppointmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // end_at must be >= start_at if provided (basic sanity)
  if (payload.end_at && new Date(payload.end_at).getTime() < new Date(payload.start_at).getTime()) {
    return NextResponse.json(
      { error: 'end_at must be >= start_at' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from('appointments')
    .insert({
      org_id: payload.org_id,
      lead_id: payload.lead_id ?? null,
      start_at: payload.start_at,
      end_at: payload.end_at ?? null,
      status: payload.status ?? 'scheduled',
      notes: payload.notes ?? null,
    })
    .select('id, org_id, lead_id, start_at, end_at, status, notes, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create appointment', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ appointment: data }, { status: 201 });
}

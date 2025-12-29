import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabase/server';

const CreateTicketSchema = z.object({
  org_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  subject: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  const { data, error } = await supabaseServer
    .from('tickets')
    .insert({
      org_id: payload.org_id,
      lead_id: payload.lead_id ?? null,
      subject: payload.subject,
      description: payload.description ?? null,
      priority: payload.priority ?? 'normal',
      status: payload.status ?? 'open',
    })
    .select('id, org_id, lead_id, subject, status, priority, description, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create ticket', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ticket: data }, { status: 201 });
}

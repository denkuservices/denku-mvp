import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBasicAuth } from '@/lib/auth/basic';
import { supabaseServer } from '@/lib/supabase/server';

/* -----------------------------
   Validation Schemas
------------------------------*/

const CreateLeadSchema = z.object({
  org_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  phone: z.string().min(3).optional(),
  email: z.string().email().optional(),
  source: z.string().optional(),
  status: z.string().optional(), // new/contacted/qualified/closed
  notes: z.string().optional(),
});

/* -----------------------------
   GET /api/admin/leads
------------------------------*/
export async function GET(request: NextRequest) {
  // 1) Basic Auth
  if (!requireBasicAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' },
    });
  }

  // 2) Query params
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org');
  const limit = Number(searchParams.get('limit') ?? '100');

  if (!orgId) {
    return NextResponse.json(
      { error: 'Missing required query param: org' },
      { status: 400 }
    );
  }

  // 3) DB query
  const { data, error } = await supabaseServer
    .from('leads')
    .select(
      'id, org_id, name, phone, email, source, status, notes, created_at, updated_at'
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch leads', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ leads: data ?? [] });
}

/* -----------------------------
   POST /api/admin/leads
------------------------------*/
export async function POST(request: NextRequest) {
  // 1) Basic Auth
  if (!requireBasicAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' },
    });
  }

  // 2) Parse JSON
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const payload = parsed.data;

  // 3) Insert
  const { data, error } = await supabaseServer
    .from('leads')
    .insert({
      org_id: payload.org_id,
      name: payload.name ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      source: payload.source ?? 'manual',
      status: payload.status ?? 'new',
      notes: payload.notes ?? null,
    })
    .select(
      'id, org_id, name, phone, email, source, status, notes, created_at, updated_at'
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to create lead', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ lead: data }, { status: 201 });
}

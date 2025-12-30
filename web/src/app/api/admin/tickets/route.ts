import { NextRequest, NextResponse } from 'next/server';
import { requireBasicAuth } from '@/lib/auth/basic';
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  if (!requireBasicAuth(request)) {
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Admin Area"' },
    });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org');
  const limit = Number(searchParams.get('limit') ?? '100');
  const status = searchParams.get('status'); // optional

  if (!orgId) {
    return NextResponse.json(
      { error: 'Missing required query param: org' },
      { status: 400 }
    );
  }

  let q = supabaseAdmin
    .from('tickets')
    .select('id, org_id, lead_id, subject, status, priority, description, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (status) q = q.eq('status', status);

  const { data, error } = await q.limit(
    Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100
  );

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch tickets', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ tickets: data ?? [] });
}


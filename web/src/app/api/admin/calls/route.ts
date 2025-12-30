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
  const limit = Number(searchParams.get('limit') ?? '50');

  if (!orgId) {
    return NextResponse.json(
      { error: 'Missing required query param: org' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('id, org_id, vapi_call_id, from_phone, to_phone, started_at, ended_at, outcome, transcript, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch calls', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ calls: data ?? [] });
}


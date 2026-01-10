import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required field
    const work_email = body.work_email?.trim();
    if (!work_email) {
      return NextResponse.json(
        { ok: false, error: 'Work email is required' },
        { status: 400 }
      );
    }

    // Email validation: must contain @ and .
    if (!work_email.includes('@') || !work_email.includes('.')) {
      return NextResponse.json(
        { ok: false, error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Prepare data for insertion
    const insertData = {
      work_email,
      name: body.name?.trim() || null,
      company: body.company?.trim() || null,
      industry: body.industry?.trim() || null,
      channels: body.channels && Array.isArray(body.channels) && body.channels.length > 0 
        ? body.channels 
        : null,
      tools: body.tools?.trim() || null,
      estimated_volume: body.estimated_volume?.trim() || null,
      message: body.message?.trim() || null,
      source: 'marketing_contact',
    };

    // Insert into Supabase
    const { error } = await supabaseAdmin
      .from('contact_requests')
      .insert(insertData);

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to submit request. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { ok: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

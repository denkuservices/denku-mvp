import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { fanoutContactRequest } from '@/lib/marketing/contactRequestFanout';

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

    /**
     * `source` tells us which surface the request came from, so the four service
     * request forms don't all land in one undifferentiated pile.
     *
     * Allowlisted rather than free-text: this value is written straight into the
     * table and read by humans triaging leads, so an attacker must not be able to
     * choose it. Anything unrecognised falls back to the contact-form default
     * instead of being rejected — a lead is worth more than a tidy label.
     */
    const ALLOWED_SOURCES = new Set([
      'marketing_contact',
      'request_ai-employees',
      'request_ai-audit',
      'request_ai-studio',
      'request_custom-ai',
    ]);
    const requestedSource = typeof body.source === 'string' ? body.source.trim() : '';
    const source = ALLOWED_SOURCES.has(requestedSource)
      ? requestedSource
      : 'marketing_contact';

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
      source,
    };

    // Insert into Supabase
    const { data: inserted, error } = await supabaseAdmin
      .from('contact_requests')
      .insert(insertData)
      .select('id')
      .single<{ id: string }>();

    if (error || !inserted) {
      console.error('Supabase insert error:', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to submit request. Please try again.' },
        { status: 500 }
      );
    }

    /**
     * Tell someone. Until 2026-09-03 this route stopped at the line above: the row was written and
     * nothing else happened — no mail, no ticket, and no screen in the product read the table. A
     * real request sat there for hours before anyone found it by querying the database.
     *
     * Awaited rather than fired and forgotten, because a serverless function can be frozen the
     * moment it responds; but wrapped, because the person who filled the form must never see an
     * error for a delivery problem on our side. The row is the record; this is the notification.
     */
    try {
      await fanoutContactRequest({ id: inserted.id, ...insertData });
    } catch (fanoutError) {
      console.error('[MARKETING][CONTACT] fanout failed (non-fatal)', fanoutError);
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

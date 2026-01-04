import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { vapiFetch } from '@/lib/vapi/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const BodySchema = z.object({
  name: z.string().min(2),
  // ileride: language, firstMessage, voice, model provider seçimi vs.
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = BodySchema.parse(await req.json());

  // org scope: user -> profile -> org zincirin zaten doğru.
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', auth.user.id)
    .single();

  if (pErr || !profile?.org_id) {
    return NextResponse.json({ error: 'Org not found' }, { status: 400 });
  }

  // Get base URL for tools serverUrl
  function getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return 'http://localhost:3000';
  }

  const baseUrl = getBaseUrl();
  const toolsServerUrl = `${baseUrl}/api/tools`;

  // 1) Vapi assistant create
  // Not: Endpoint path docs'ta "Assistants -> Create" altında; tipik Vapi pattern'i /assistant.
  // Eğer sende farklı çıkarsa, burada path'i tek yerden düzeltiriz.
  const created = await vapiFetch<any>('/assistant', {
    method: 'POST',
    body: JSON.stringify({
      name: body.name,
      // minimum viable config:
      model: {
        provider: 'openai',
        model: 'gpt-4o',
        messages: [{ role: 'system', content: 'You are a helpful voice assistant.' }],
      },
      firstMessage: 'Hello! How can I help you today?',
      serverUrl: toolsServerUrl,
      tools: [
        {
          type: 'function',
          function: {
            name: 'create_appointment',
            description: 'Schedule an appointment for a lead. Accepts natural language date/time or ISO format.',
            parameters: {
              type: 'object',
              properties: {
                to_phone: {
                  type: 'string',
                  description: 'The organization phone number (destination)',
                  minLength: 3,
                },
                start_at: {
                  type: 'string',
                  description: 'ISO 8601 datetime string (e.g., "2024-01-15T14:30:00Z")',
                },
                start_at_text: {
                  type: 'string',
                  description: 'Natural language date/time (e.g., "tomorrow at 2pm", "next Monday at 10am")',
                },
                lead_phone: {
                  type: 'string',
                  description: 'Lead phone number (minimum 7 digits)',
                  minLength: 7,
                },
                lead_name: {
                  type: 'string',
                  description: 'Lead name',
                },
                lead_email: {
                  type: 'string',
                  format: 'email',
                  description: 'Lead email address',
                },
                purpose: {
                  type: 'string',
                  description: 'Purpose or reason for the appointment',
                },
                notes: {
                  type: 'string',
                  description: 'Additional notes about the appointment',
                },
                call_id: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Internal calls.id UUID for linking artifacts to a call',
                },
              },
              required: ['to_phone'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'create_ticket',
            description: 'Create a support ticket for a lead',
            parameters: {
              type: 'object',
              properties: {
                to_phone: {
                  type: 'string',
                  description: 'The organization phone number (destination)',
                  minLength: 3,
                },
                lead_phone: {
                  type: 'string',
                  description: 'Lead phone number (minimum 7 digits)',
                  minLength: 7,
                },
                lead_name: {
                  type: 'string',
                  description: 'Lead name',
                },
                lead_email: {
                  type: 'string',
                  format: 'email',
                  description: 'Lead email address',
                },
                subject: {
                  type: 'string',
                  description: 'Ticket subject line',
                },
                description: {
                  type: 'string',
                  description: 'Detailed description of the support request',
                },
                priority: {
                  type: 'string',
                  enum: ['low', 'normal', 'high'],
                  description: 'Ticket priority level',
                },
                notes: {
                  type: 'string',
                  description: 'Additional notes about the ticket',
                },
                call_id: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Internal calls.id UUID for linking artifacts to a call',
                },
              },
              required: ['to_phone', 'lead_phone'],
            },
          },
        },
      ],
    }),
  });

  const vapi_assistant_id = created?.id;
  if (!vapi_assistant_id) {
    return NextResponse.json({ error: 'Vapi assistant id missing' }, { status: 502 });
  }

  // 2) DB persist (agents tablosuna yaz)
  const { data: agent, error: aErr } = await supabase
    .from('agents')
    .insert({
      org_id: profile.org_id,
      name: body.name,
      vapi_assistant_id, // bu kolon yoksa ekleyeceğiz
      status: 'active',
    })
    .select('*')
    .single();

  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  return NextResponse.json({ agent });
}

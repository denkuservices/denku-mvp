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

  // 1) Vapi assistant create
  // Not: Endpoint path docs’ta "Assistants -> Create" altında; tipik Vapi pattern’i /assistant.
  // Eğer sende farklı çıkarsa, burada path’i tek yerden düzeltiriz.
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
      // serverUrl vs webhook config’leri birazdan bağlayacağız.
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

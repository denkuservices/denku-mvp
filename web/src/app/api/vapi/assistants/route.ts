import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { vapiFetch } from "@/lib/vapi/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BodySchema = z.object({
  name: z.string().min(2),
  language: z.string().min(2).default("en"),
  voice: z.string().min(1).default("alloy"),
  timezone: z.string().min(1).default("America/New_York"),

  systemPrompt: z.string().min(2).optional(),
  firstMessage: z.string().min(2).optional(),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.parse(await req.json());

  // org_id from profiles (admin client to avoid RLS surprises)
  const { data: profile, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", auth.user.id)
    .single<{ org_id: string | null }>();

  if (pErr || !profile?.org_id) {
    return NextResponse.json({ ok: false, error: "Org not found", details: pErr?.message }, { status: 400 });
  }

  const orgId = profile.org_id;

  // Create assistant in Vapi (systemPrompt must be model.messages; NOT top-level)
  const assistantBody: any = {
    name: body.name,
    firstMessage: body.firstMessage ?? "Hello! How can I help you today?",
    model: {
      provider: "openai",
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: body.systemPrompt ?? "You are a helpful inbound phone assistant.",
        },
      ],
    },
    voice: { provider: "openai", voiceId: body.voice },
  };

  const created = await vapiFetch<any>("/assistant", {
    method: "POST",
    body: JSON.stringify(assistantBody),
  });

  const vapi_assistant_id = created?.id as string | undefined;
  if (!vapi_assistant_id) {
    return NextResponse.json({ ok: false, error: "Vapi assistant id missing" }, { status: 502 });
  }

  // Persist to Supabase agents
  const { data: agent, error: aErr } = await supabaseAdmin
    .from("agents")
    .insert({
      org_id: orgId,
      name: body.name,
      language: body.language,
      voice: body.voice,
      timezone: body.timezone,
      created_by: auth.user.id,
      vapi_assistant_id,
      vapi_provider: "vapi",
    })
    .select("*")
    .single();

  if (aErr) {
    return NextResponse.json({ ok: false, error: "Insert agent failed", details: aErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, agent });
}

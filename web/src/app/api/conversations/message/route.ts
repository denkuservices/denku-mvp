import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  conversation_id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  response_ms: z.number().int().nonnegative().optional(),
});

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function resolveUser(req: NextRequest) {
  // 1) Önce cookie-based (UI / browser)
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { user, mode: "cookie" as const };
  } catch {
    // cookie write/ctx sorunlarında patlasa bile aşağıda bearer’a düşeceğiz
  }

  // 2) Sonra bearer token (PowerShell test)
  const token = getBearerToken(req);
  if (!token) return { user: null, mode: "none" as const };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { user: null, mode: "none" as const };

  const supabase = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, mode: "bearer" as const };
}

export async function POST(req: NextRequest) {
  // 0) body parse
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { conversation_id, role, content, response_ms } = parsed.data;

  // 1) user resolve (cookie veya bearer)
  const { user } = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2) Server client (DB işleri için)
  const supabase = await createSupabaseServerClient();

  // 3) profile -> org_id
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  const orgId = profile?.org_id ?? null;
  if (profErr || !orgId) {
    return NextResponse.json({ error: "Missing org" }, { status: 403 });
  }

  // 4) conversation gerçekten bu org’a mı ait?
  const { data: convo, error: convoErr } = await supabase
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversation_id)
    .single<{ id: string; org_id: string }>();

  if (convoErr || !convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  if (convo.org_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5) insert message (kolon adı: org_id)
  const insertPayload: Record<string, any> = {
    conversation_id,
    org_id: orgId,
    role,
    content,
  };

  // Eğer tablonuzda response_ms kolonu yoksa bunu eklemeyin.
  if (typeof response_ms === "number") {
    insertPayload.response_ms = response_ms;
  }

  const { data: msg, error: insErr } = await supabase
    .from("conversation_messages")
    .insert(insertPayload)
    .select("id, conversation_id, role, content, created_at, org_id")
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: msg }, { status: 200 });
}

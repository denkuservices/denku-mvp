import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Append a message to a conversation (Sprint 4.5: aligned to the canonical model).
 *
 * Fixes two latent defects surfaced by the platform-model adoption:
 *   1) it wrote to `conversation_messages` — a table that does not exist (dead route);
 *      the canonical table is `messages`.
 *   2) it wrote via the user-session client, which now that `messages` is RLS-locked
 *      (service-role only) would get zero rows. We authenticate the user, verify org
 *      ownership of the conversation, then write via the service-role admin client with
 *      explicit org scoping — the repo's standard tenant-safe pattern.
 */

const BodySchema = z.object({
  conversation_id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]).optional(),
});

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

async function resolveUser(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return user;
  } catch {
    // fall through to bearer
  }

  const token = getBearerToken(req);
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
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
  const { conversation_id, role, content, direction } = parsed.data;

  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve caller's org (service-role read; scoped by the user's own id).
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  const orgId = profile?.org_id ?? null;
  if (!orgId) {
    return NextResponse.json({ error: "Missing org" }, { status: 403 });
  }

  // Verify the conversation belongs to the caller's org before writing.
  const { data: convo } = await supabaseAdmin
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversation_id)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; org_id: string }>();

  if (!convo) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { data: msg, error: insErr } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id,
      org_id: orgId,
      role,
      content,
      direction: direction ?? null,
    })
    .select("id, conversation_id, role, content, created_at, org_id")
    .single();

  if (insErr) {
    return NextResponse.json({ error: "Failed to append message" }, { status: 500 });
  }

  // Advance conversation recency (non-fatal).
  await supabaseAdmin
    .from("conversations")
    .update({ last_message_at: nowIso, last_activity_at: nowIso })
    .eq("id", conversation_id)
    .eq("org_id", orgId);

  return NextResponse.json({ ok: true, message: msg }, { status: 200 });
}

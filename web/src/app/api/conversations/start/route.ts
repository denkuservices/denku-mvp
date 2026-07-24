import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isKnownChannel } from "@/lib/platform/channels";

/**
 * Start a conversation (Sprint 4.5: aligned to the canonical model + RLS).
 *
 * Now that `conversations` is RLS-locked (service-role only), this authenticates the user,
 * resolves their org, validates the channel against the platform registry, and inserts via
 * the service-role admin client with explicit org scoping — the repo's tenant-safe pattern.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();

  if (authError || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const agent_id = body?.agent_id ?? null;
  const channelRaw = body?.channel ?? "web";
  const channel = isKnownChannel(channelRaw) ? channelRaw : "web";
  const external_user_id = body?.external_user_id ?? null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  const org_id = profile?.org_id ?? null;
  if (!org_id) {
    return NextResponse.json({ error: "No org_id on profile" }, { status: 400 });
  }

  const { data: conv, error } = await supabaseAdmin
    .from("conversations")
    .insert({
      org_id,
      agent_id,
      channel,
      external_user_id,
      status: "open",
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to start conversation" }, { status: 500 });
  }

  return NextResponse.json({ id: conv.id });
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  
  // Handle missing session gracefully
  if (authError || !auth?.user) {
    // Don't throw AuthSessionMissingError - return proper 401 response
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const agent_id = body?.agent_id ?? null;
  const channel = body?.channel ?? "web";
  const external_user_id = body?.external_user_id ?? null;

  // org from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const org_id = profile?.org_id ?? null;
  if (!org_id) {
    return NextResponse.json({ error: "No org_id on profile" }, { status: 400 });
  }

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      org_id,
      agent_id,
      channel,
      external_user_id,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: conv.id });
}

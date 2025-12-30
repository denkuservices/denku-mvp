"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function createAgentAction(formData: FormData) {
  const name = mustString(formData.get("name"), "name");
  const language = mustString(formData.get("language"), "language");
  const voice = mustString(formData.get("voice"), "voice");
  const timezone = mustString(formData.get("timezone"), "timezone");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) redirect("/login");

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  if (profErr) throw new Error(profErr.message);
  if (!profile?.org_id) throw new Error("No org found for this user.");

  const { error: insErr } = await supabaseAdmin.from("agents").insert({
    org_id: profile.org_id,
    name,
    language,
    voice,
    timezone,
    created_by: user.id,
  });

  if (insErr) throw new Error(insErr.message);

  redirect("/dashboard");
}
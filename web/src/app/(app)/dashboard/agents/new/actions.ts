"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

type VapiCreateAssistantResponse = {
  id: string;
  name?: string;
};

export async function createAgentAction(formData: FormData) {
  const name = mustString(formData.get("name"), "name");
  const language = mustString(formData.get("language"), "language");
  const voice = mustString(formData.get("voice"), "voice");
  const timezone = mustString(formData.get("timezone"), "timezone");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) redirect("/login");

  // org_id
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string | null }>();

  if (profErr) throw new Error(profErr.message);
  if (!profile?.org_id) throw new Error("No org found for this user.");

  // 1) Vapi Assistant Create  (POST /assistant)
  // Base URL: https://api.vapi.ai  :contentReference[oaicite:2]{index=2}
  const created = await vapiFetch<VapiCreateAssistantResponse>("/assistant", {
    method: "POST",
    body: JSON.stringify({
      name,
      // MVP: basit model/voice bağlama. Detayı sonra "Agent Detail" ekranından editleriz.
      // Not: Vapi tarafında voice/language mapping provider'a göre değişebilir; şimdilik "metadata" ile saklıyoruz.
      metadata: {
        org_id: profile.org_id,
        created_by: user.id,
        language,
        voice,
        timezone,
      },
    }),
  });

  if (!created?.id) throw new Error("Vapi assistant id missing from response.");

  // 2) DB insert (agents)
  const { error: insErr } = await supabaseAdmin.from("agents").insert({
    org_id: profile.org_id,
    name,
    language,
    voice,
    timezone,
    created_by: user.id,
    vapi_assistant_id: created.id,
  });

  if (insErr) throw new Error(insErr.message);

  redirect("/dashboard");
}

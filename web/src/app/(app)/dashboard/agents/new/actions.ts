"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

type VapiCreateAssistantResponse = { id: string };
type VapiCreatePhoneNumberResponse = { id: string };

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

  const orgId = profile.org_id;

  // 1) Vapi: phone number create (tenant-specific)
  const phone = await vapiFetch<VapiCreatePhoneNumberResponse>("/phone-number", {
    method: "POST",
    body: JSON.stringify({
      metadata: { org_id: orgId, created_by: user.id },
    }),
  });
  if (!phone?.id) throw new Error("Vapi phone number id missing.");

  // 2) Vapi: assistant create
  const assistant = await vapiFetch<VapiCreateAssistantResponse>("/assistant", {
    method: "POST",
    body: JSON.stringify({
      name,
      metadata: {
        org_id: orgId,
        created_by: user.id,
        language,
        voice,
        timezone,
      },
    }),
  });
  if (!assistant?.id) throw new Error("Vapi assistant id missing.");

  // 3) Vapi: bind phone number → assistant
  await vapiFetch(`/phone-number/${phone.id}`, {
    method: "PATCH",
    body: JSON.stringify({ assistantId: assistant.id }),
  });

  // 4) Supabase: insert agent (single source of truth)
  const { error: insErr } = await supabaseAdmin.from("agents").insert({
    org_id: orgId,
    name,
    language,
    voice,
    timezone,
    created_by: user.id,
    vapi_assistant_id: assistant.id,
    vapi_phone_number_id: phone.id,
  });
  if (insErr) throw new Error(insErr.message);

  redirect("/dashboard");
}

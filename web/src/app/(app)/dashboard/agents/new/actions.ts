"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

function getBaseUrl() {
  // Local dev fallback
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.startsWith("http")) return site.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function createAgentAction(formData: FormData) {
  const name = mustString(formData.get("name"), "name");
  const language = mustString(formData.get("language"), "language");
  const voice = mustString(formData.get("voice"), "voice");
  const timezone = mustString(formData.get("timezone"), "timezone");

  // Ensure user is authenticated in this server action context
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user) redirect("/login");

  // Forward cookies explicitly so /api/vapi/assistants can read the session
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const baseUrl = getBaseUrl();

  const res = await fetch(`${baseUrl}/api/vapi/assistants`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ name, language, voice, timezone }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Create agent failed: ${res.status} ${text}`);
  }

  redirect("/dashboard");
}

"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { resolveLanguage, resolveVoice } from "@/lib/vapi/assistantConfig";

/** Trimmed value, or null when absent. Never throws: a missing field is a message, not a crash. */
function readString(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type VapiCreateAssistantResponse = { id: string };
type VapiCreatePhoneNumberResponse = { id: string };

/**
 * What the caller gets back.
 *
 * Expected refusals — a paused workspace, no phone capacity — are RETURNED, not thrown. Thrown
 * errors from a server action reach the route's error boundary, which says "Something went wrong.
 * We couldn't load this page." That sentence is true of a crash and useless for a rule the
 * customer could satisfy if only they were told what it was.
 */
export type CreateAgentResult = { ok: true } | { ok: false; error: string };

export async function createAgentAction(
  _prev: CreateAgentResult | null,
  formData: FormData
): Promise<CreateAgentResult> {
  const name = readString(formData.get("name"));
  const timezone = readString(formData.get("timezone"));
  const languageRaw = readString(formData.get("language"));

  if (!name) return { ok: false, error: "Give your employee a name." };
  if (!timezone) return { ok: false, error: "Pick a timezone." };
  if (!languageRaw) return { ok: false, error: "Pick a primary language." };

  /*
   * Language is normalized, and the voice is derived from it (2026-08-28).
   *
   * The form used to post a `voice` of its own — "Alloy", "Verse", "Aria" — which was stored on
   * the row, put in Vapi metadata, and never applied to anything. `alloy` was also the exact
   * OpenAI voice English moved off yesterday for sounding like a robot reading. A voice is not an
   * independent choice: the registry knows which one each language is spoken with, so the form no
   * longer asks a question whose answer it would only have discarded.
   */
  const language = resolveLanguage(languageRaw);
  const voice = resolveVoice(language).voiceId;

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

  if (profErr) return { ok: false, error: "Could not load your workspace. Please try again." };
  if (!profile?.org_id) return { ok: false, error: "No workspace found for this account." };

  const orgId = profile.org_id;

  // D) Billing pause overrides everything - deny agent creation if workspace is paused
  const { data: orgSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
    }>();

  if (orgSettings?.workspace_status === "paused") {
    const pausedReason = orgSettings.paused_reason;
    return {
      ok: false,
      error:
        pausedReason === "hard_cap" || pausedReason === "past_due"
          ? "Your workspace is paused over billing. Update your payment method to hire again."
          : "Your workspace is paused, so new employees can't be hired right now.",
    };
  }

  // B) Enforce phone number limit before creating/binding
  const { getEffectiveLimits } = await import("@/lib/billing/limits");
  const effectiveLimits = await getEffectiveLimits(orgId);
  const includedPhones = effectiveLimits.included_phones;

  // Count currently bound phone numbers (agents with both vapi_phone_number_id AND vapi_assistant_id)
  const { count: boundCount, error: countErr } = await supabaseAdmin
    .from("agents")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .not("vapi_phone_number_id", "is", null)
    .not("vapi_assistant_id", "is", null);

  if (countErr) {
    return { ok: false, error: "Could not check your phone number allowance. Please try again." };
  }

  /**
   * Whether this employee gets a phone line.
   *
   * This used to refuse the whole hire when there was no phone capacity, which made a chat-only
   * workspace unable to hire ANY employee: its plan includes zero numbers, so `0 >= 0` threw
   * before a single field was read. A customer who bought chat was told "Phone number limit
   * reached" for wanting an employee to answer messages — and, because the error was thrown,
   * actually saw "Something went wrong."
   *
   * An employee without a phone line is not a broken employee. It answers on every chat channel
   * the workspace has connected, which for a chat-only plan is the entire product. So a missing
   * number changes WHAT is created, not WHETHER.
   */
  const currentBoundCount = boundCount ?? 0;
  const withPhone = currentBoundCount < includedPhones;

  if (!withPhone) {
    const { error: chatInsErr } = await supabaseAdmin.from("agents").insert({
      org_id: orgId,
      name,
      language,
      voice,
      timezone,
      created_by: user.id,
      // No Vapi assistant and no number: nothing was provisioned, and writing ids for artifacts
      // that do not exist would break the reconcile paths that trust those columns.
    });
    if (chatInsErr) return { ok: false, error: "Could not create the employee. Please try again." };

    redirect("/dashboard/team");
  }

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
  if (insErr) return { ok: false, error: "Could not create the employee. Please try again." };

  redirect("/dashboard/team");
}

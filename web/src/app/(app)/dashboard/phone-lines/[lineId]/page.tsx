import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isPreviewMode } from "@/lib/billing/isPreviewMode";
import { SuccessBanner } from "./SuccessBanner";
import { PhoneLineDetailClient } from "./PhoneLineDetailClient";

export const dynamic = "force-dynamic";

/**
 * Fetch phone line with retry logic for newly created lines.
 */
async function fetchPhoneLineWithRetry(
  lineId: string,
  orgId: string,
  isNewlyCreated: boolean,
  maxRetries: number = 5
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Use admin client to avoid caching issues
    // First try with all columns (including v1 fields)
    // If that fails due to missing columns, fall back to base columns only
    let { data: phoneLine, error } = await supabaseAdmin
      .from("phone_lines")
      .select("id, phone_number_e164, vapi_phone_number_id, assigned_agent_id, status, line_type, created_at, updated_at, display_name, language_mode, tools_create_ticket, tools_book_appointment, first_message")
      .eq("id", lineId)
      .eq("org_id", orgId)
      .maybeSingle<{
        id: string;
        phone_number_e164: string | null;
        vapi_phone_number_id?: string | null;
        assigned_agent_id?: string | null;
        status: string | null;
        line_type: string | null;
        created_at: string;
        updated_at: string;
        display_name?: string | null;
        language_mode?: string | null;
        tools_create_ticket?: boolean | null;
        tools_book_appointment?: boolean | null;
        first_message?: string | null;
      }>();

    // If error is due to missing columns, retry with base columns only
    if (error && error.message?.includes("column") && error.message?.includes("does not exist")) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[PhoneLineDetail] Missing v1 columns, falling back to base columns");
      }
      const fallbackResult = await supabaseAdmin
        .from("phone_lines")
        .select("id, phone_number_e164, status, line_type, created_at, updated_at")
        .eq("id", lineId)
        .eq("org_id", orgId)
        .maybeSingle<{
          id: string;
          phone_number_e164: string | null;
          status: string | null;
          line_type: string | null;
          created_at: string;
          updated_at: string;
        }>();

      if (fallbackResult.data && !fallbackResult.error) {
        // Map to expected format with null v1 fields
        phoneLine = {
          ...fallbackResult.data,
          vapi_phone_number_id: null,
          assigned_agent_id: null,
          display_name: null,
          language_mode: null,
          tools_create_ticket: null,
          tools_book_appointment: null,
          first_message: null,
        };
        error = null;
      } else {
        error = fallbackResult.error;
      }
    }

    // Debug logging (development only)
    if (process.env.NODE_ENV !== "production") {
      if (error) {
        console.warn(`[PhoneLineDetail] Attempt ${attempt + 1} error:`, {
          lineId,
          orgId,
          error: error.message,
          code: error.code,
        });
      } else if (!phoneLine) {
        console.warn(`[PhoneLineDetail] Attempt ${attempt + 1} - no data:`, {
          lineId,
          orgId,
        });
      } else {
        console.log(`[PhoneLineDetail] Attempt ${attempt + 1} - found line:`, {
          lineId: phoneLine.id,
          orgId,
        });
      }
    }

    if (phoneLine && !error) {
      return phoneLine;
    }

    // If not found and this is a newly created line, retry with delay
    if (isNewlyCreated && attempt < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }

    // If error or not found after retries, return null
    if (error) {
      console.warn("[PhoneLineDetail] Error fetching phone line:", error.message);
    }
    return null;
  }

  return null;
}

export default async function PhoneLineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ lineId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { lineId } = await params;
  const { created } = await searchParams;
  const showSuccessBanner = created === "1";
  const isNewlyCreated = created === "1";
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get org_id from profile (same pattern as list page)
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (profileError) {
    console.error("[PhoneLineDetail] Error fetching profile:", profileError);
  }

  const profile = profiles && profiles.length > 0 ? profiles[0] : null;
  const orgId = profile?.org_id ?? null;

  if (!orgId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No organization found. Please contact support.
        </div>
      </div>
    );
  }

  // Debug logging (development only)
  if (process.env.NODE_ENV !== "production") {
    console.log("[PhoneLineDetail] Fetching line:", { lineId, orgId, isNewlyCreated });
  }

  // Fetch phone line from phone_lines table with retry logic if newly created
  const line = await fetchPhoneLineWithRetry(lineId, orgId, isNewlyCreated);

  if (!line) {
    // Debug logging (development only)
    if (process.env.NODE_ENV !== "production") {
      console.warn("[PhoneLineDetail] Line not found:", { lineId, orgId });
    }

    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {isNewlyCreated
            ? "We're finishing setup for your new line. Please refresh in a moment."
            : "Phone line not found."}
        </div>
        <Link
          href="/dashboard/phone-lines"
          className="mt-4 inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
        >
          Back to Phone Lines
        </Link>
      </div>
    );
  }

  // Check if user is in preview mode (no active plan)
  let previewMode = false;
  try {
    previewMode = await isPreviewMode(orgId);
  } catch (err) {
    // Fallback to false (paid state) if check fails
    console.warn("[PhoneLineDetail] Error checking plan status, defaulting to paid state:", err);
    previewMode = false;
  }

  // Metrics: today calls, last call, capacity (read-only)
  let todayInboundCalls: number | null = null;
  let lastCallFormatted = "—";
  let capacityLabel = "Preview";

  const vapiId = (line as { vapi_phone_number_id?: string | null }).vapi_phone_number_id;

  if (vapiId) {
    // Today calls: use existing RPC; fallback to direct count if RPC unavailable
    try {
      const { data: counts } = await supabaseAdmin.rpc("fn_calls_today_counts_by_phone_number", {
        p_org_id: orgId,
        p_vapi_phone_number_ids: [vapiId],
      });
      const row = (counts || []).find((r: { vapi_phone_number_id: string }) => r.vapi_phone_number_id === vapiId);
      if (row != null) {
        todayInboundCalls = Number((row as { today_inbound_calls: number }).today_inbound_calls) ?? 0;
      }
    } catch {
      // RPC may not exist; fallback to direct count
    }
    if (todayInboundCalls === null) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startOfDayISO = startOfDay.toISOString();
      const { count } = await supabaseAdmin
        .from("calls")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("vapi_phone_number_id", vapiId)
        .eq("direction", "inbound")
        .gte("started_at", startOfDayISO);
      todayInboundCalls = count ?? 0;
    }

    // Last call: latest inbound call for this phone line (by vapi_phone_number_id)
    const { data: lastCall } = await supabaseAdmin
      .from("calls")
      .select("started_at")
      .eq("org_id", orgId)
      .eq("vapi_phone_number_id", vapiId)
      .eq("direction", "inbound")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ started_at: string | null }>();
    if (lastCall?.started_at) {
      const d = new Date(lastCall.started_at);
      if (!Number.isNaN(d.getTime())) {
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        if (diffMins < 1) lastCallFormatted = "Just now";
        else if (diffMins < 60) lastCallFormatted = `${diffMins}m ago`;
        else if (diffHours < 24) lastCallFormatted = `${diffHours}h ago`;
        else if (diffDays < 7) lastCallFormatted = `${diffDays}d ago`;
        else lastCallFormatted = d.toLocaleDateString();
      }
    }
  }

  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code, concurrency_limit")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null; concurrency_limit: number | null }>();
  if (planLimits?.plan_code != null && planLimits?.concurrency_limit != null) {
    capacityLabel = `Concurrent calls: ${planLimits.concurrency_limit}`;
  }

  // Fetch agent for Advanced tab (system_prompt_override, vapi_assistant_id)
  let agentForAdvanced: { vapi_assistant_id: string | null; system_prompt_override: string | null } | null = null;
  const assignedAgentId = (line as { assigned_agent_id?: string | null }).assigned_agent_id;
  if (assignedAgentId) {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("vapi_assistant_id, system_prompt_override")
      .eq("id", assignedAgentId)
      .eq("org_id", orgId)
      .maybeSingle<{ vapi_assistant_id: string | null; system_prompt_override: string | null }>();
    if (agent) {
      agentForAdvanced = {
        vapi_assistant_id: agent.vapi_assistant_id ?? null,
        system_prompt_override: agent.system_prompt_override ?? null,
      };
    }
  }

  // Normalize line at boundary so client receives string | null (not undefined) for required fields
  const normalizedLine = {
    id: line.id,
    phone_number_e164: line.phone_number_e164 ?? null,
    status: line.status ?? null,
    line_type: line.line_type ?? null,
    display_name: line.display_name ?? null,
    language_mode: (line as { language_mode?: string | null }).language_mode ?? null,
    tools_create_ticket: (line as { tools_create_ticket?: boolean | null }).tools_create_ticket ?? null,
    tools_book_appointment: (line as { tools_book_appointment?: boolean | null }).tools_book_appointment ?? null,
    first_message: (line as { first_message?: string | null }).first_message ?? null,
    vapi_phone_number_id: (line as { vapi_phone_number_id?: string | null }).vapi_phone_number_id ?? null,
    assigned_agent_id: (line as { assigned_agent_id?: string | null }).assigned_agent_id ?? null,
  };

  return (
    <>
      {/* Success Banner */}
      {showSuccessBanner && <SuccessBanner />}
      <PhoneLineDetailClient
        line={normalizedLine}
        orgId={orgId}
        agentForAdvanced={agentForAdvanced}
        isPreviewMode={previewMode}
        todayInboundCalls={todayInboundCalls ?? 0}
        lastCallFormatted={lastCallFormatted}
        capacityLabel={capacityLabel}
      />
    </>
  );
}

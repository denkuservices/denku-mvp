import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PhoneLineRow = {
  id: string;
  phone_number_e164: string | null;
  vapi_phone_number_id: string | null;
  status: string | null;
  line_type: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  /** Today's inbound call count (from RPC). Set by getPhoneLinesWithTodayCounts (default 0). */
  todayInboundCalls?: number;
};

/**
 * Fetch phone lines for an organization.
 * Returns phone lines scoped to the current org, ordered by created_at desc.
 */
export async function getPhoneLinesList(orgId: string): Promise<PhoneLineRow[]> {
  const supabase = await createSupabaseServerClient();

  // Try to fetch with display_name and vapi_phone_number_id, fallback if columns don't exist
  let { data: phoneLines, error } = await supabase
    .from("phone_lines")
    .select("id, phone_number_e164, vapi_phone_number_id, status, line_type, display_name, created_at, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  // If column doesn't exist, fallback to base columns (no vapi_phone_number_id)
  if (error && error.message?.includes("column") && error.message?.includes("does not exist")) {
    const fallbackResult = await supabase
      .from("phone_lines")
      .select("id, phone_number_e164, status, line_type, display_name, created_at, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    const fallbackData = fallbackResult.data;
    const fallbackError = fallbackResult.error;

    if (fallbackError) {
      const baseRes = await supabase
        .from("phone_lines")
        .select("id, phone_number_e164, status, line_type, created_at, updated_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      const baseData = baseRes.data;
      const baseError = baseRes.error;

      if (baseData && !baseError) {
        phoneLines = baseData.map((line) => ({
          ...line,
          display_name: null,
          vapi_phone_number_id: null,
        }));
        error = null;
      } else {
        error = baseError ?? null;
      }
    } else if (fallbackData && !fallbackError) {
      phoneLines = fallbackData.map((line) => ({
        ...line,
        vapi_phone_number_id: (line as Record<string, unknown>).vapi_phone_number_id ?? null,
      }));
      error = null;
    } else {
      error = fallbackError ?? null;
    }
  }

  if (error) {
    console.error("[PHONE_LINES] Error fetching phone lines:", error);
    return [];
  }

  return (phoneLines || []).map((row) => ({
    ...row,
    vapi_phone_number_id: (row as Record<string, unknown>).vapi_phone_number_id ?? null,
  })) as PhoneLineRow[];
}

/**
 * Fetch phone lines for an org with today's inbound call count per line.
 * Single grouped query via RPC (no N+1).
 * "Today" = server date boundary (date_trunc('day', now())).
 * Returns rows with todayInboundCalls: number (default 0).
 */
export async function getPhoneLinesWithTodayCounts(orgId: string): Promise<PhoneLineRow[]> {
  const supabase = await createSupabaseServerClient();

  // Step A: fetch phone lines
  const { data: lines, error } = await supabase
    .from("phone_lines")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!lines || lines.length === 0) return [];

  // Step B: aggregate today inbound calls via RPC
  const vapiPhoneNumberIds = lines
    .map((l) => l.vapi_phone_number_id)
    .filter(Boolean) as string[];

  const todayMap = new Map<string, number>();

  if (vapiPhoneNumberIds.length > 0) {
    const { data: counts, error: rpcError } = await supabase.rpc(
      "fn_calls_today_counts_by_phone_number",
      {
        p_org_id: orgId,
        p_vapi_phone_number_ids: vapiPhoneNumberIds,
      }
    );

    if (rpcError) throw rpcError;

    (counts || []).forEach((row: { vapi_phone_number_id: string; today_inbound_calls: number }) => {
      todayMap.set(row.vapi_phone_number_id, Number(row.today_inbound_calls) ?? 0);
    });
  }

  // Step C: merge result
  return lines.map((line) => ({
    ...line,
    todayInboundCalls: todayMap.get(line.vapi_phone_number_id ?? "") ?? 0,
  })) as PhoneLineRow[];
}

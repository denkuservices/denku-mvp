import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vapiFetch } from "@/lib/vapi/server";

export type AvailableNumber = {
  phoneNumber: string;
  friendly: string;
  locality?: string;
  region?: string;
  capabilities?: string[];
};

/**
 * GET /api/phone-lines/available-numbers
 *
 * Returns phone numbers available for provisioning (purchasable), not already owned.
 * Vapi's public API has no "search available numbers" endpoint; GET /phone-number lists
 * only provisioned (owned) numbers. We therefore do NOT return those as selectable.
 * No DB writes. Auth required (same as purchase route).
 *
 * Query: country (default US), areaCode (optional, 3 digits).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country") || "US";
    const areaCode = searchParams.get("areaCode") || "";

    if (country !== "US") {
      return NextResponse.json(
        { error: "Only US is supported" },
        { status: 400 }
      );
    }

    // Auth: same pattern as purchase route
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .maybeSingle<{ org_id: string | null }>();

    if (profileError) {
      console.error("[available-numbers] Profile fetch failed", { error: profileError });
      return NextResponse.json(
        { error: "Failed to fetch user profile" },
        { status: 500 }
      );
    }

    if (!profile?.org_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400 }
      );
    }

    // Vapi has no "available to purchase" search endpoint; GET /phone-number returns owned numbers only.
    // We call it only to avoid 404; owned items are filtered out so we never return them as selectable.
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (areaCode && /^\d{3}$/.test(areaCode)) {
      params.set("areaCode", areaCode);
    }
    const path = `/phone-number?${params.toString()}`;

    let raw: unknown;
    try {
      raw = await vapiFetch<unknown>(path);
    } catch (vapiErr) {
      const msg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
      if (msg.includes("404") || msg.includes("400")) {
        return NextResponse.json({ numbers: [] });
      }
      console.error("[available-numbers] Vapi error", { err: vapiErr });
      return NextResponse.json(
        { error: msg.replace(/^Vapi error \d+: /, "").trim() || "Failed to load available numbers" },
        { status: 500 }
      );
    }

    const numbers = normalizeVapiAvailableResponse(raw);
    return NextResponse.json({ numbers });
  } catch (err) {
    console.error("[available-numbers] Unexpected error", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load available numbers" },
      { status: 500 }
    );
  }
}

function formatE164ToFriendly(e164: string): string {
  const cleaned = e164.replace(/\D/g, "");
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const area = cleaned.slice(1, 4);
    const exchange = cleaned.slice(4, 7);
    const rest = cleaned.slice(7);
    return `(${area}) ${exchange}-${rest}`;
  }
  return e164;
}

function normalizeVapiAvailableResponse(raw: unknown): AvailableNumber[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeItem(item))
      .filter((n): n is AvailableNumber => n !== null);
  }
  if (raw && typeof raw === "object" && "numbers" in raw && Array.isArray((raw as { numbers: unknown }).numbers)) {
    return (raw as { numbers: unknown[] }).numbers
      .map((item) => normalizeItem(item))
      .filter((n): n is AvailableNumber => n !== null);
  }
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: unknown[] }).data
      .map((item) => normalizeItem(item))
      .filter((n): n is AvailableNumber => n !== null);
  }
  return [];
}

/** Owned-resource indicators from Vapi list response; such items must not be returned as "available". */
const OWNED_INDICATORS = ["id", "createdAt", "updatedAt", "orgId", "assistantId", "status"];

function looksLikeOwnedResource(o: Record<string, unknown>): boolean {
  return OWNED_INDICATORS.some((key) => key in o && o[key] != null);
}

function normalizeItem(item: unknown): AvailableNumber | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (looksLikeOwnedResource(o)) return null;
  const phoneNumber =
    typeof o.phoneNumber === "string"
      ? o.phoneNumber
      : typeof o.number === "string"
        ? o.number
        : typeof o.phone_number === "string"
          ? o.phone_number
          : null;
  if (!phoneNumber) return null;
  const friendly =
    typeof o.friendly === "string"
      ? o.friendly
      : formatE164ToFriendly(phoneNumber);
  const locality = typeof o.locality === "string" ? o.locality : typeof o.city === "string" ? o.city : undefined;
  const region = typeof o.region === "string" ? o.region : typeof o.state === "string" ? o.state : undefined;
  let capabilities: string[] | undefined;
  if (Array.isArray(o.capabilities)) {
    capabilities = o.capabilities.filter((c): c is string => typeof c === "string");
  }
  return { phoneNumber, friendly, locality, region, capabilities };
}

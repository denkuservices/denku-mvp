"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createConnection,
  deleteConnection,
  rotateSiteKey,
  updateConnection,
} from "@/lib/webchat/connections";
import { defaultEmployeeIdForOrg } from "@/lib/platform/defaultEmployee";

/**
 * Web Chat install actions.
 *
 * Owner/admin only. The thing being handed over is not a credential — the site key is public by
 * design — but the **allowlist is**: whoever can edit it decides which websites may run this
 * business's AI, and that is exactly as consequential as connecting a bot token.
 */

async function requireOrgAdmin(): Promise<
  { ok: true; orgId: string; userId: string } | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ org_id: string | null; role: string | null }>();

  if (!profile?.org_id) return { ok: false, error: "No organization" };
  if (profile.role !== "owner" && profile.role !== "admin") {
    return { ok: false, error: "Only owners and admins can manage the chat widget" };
  }
  return { ok: true, orgId: profile.org_id, userId: user.id };
}

function revalidate() {
  revalidatePath("/dashboard/channels/web");
  revalidatePath("/dashboard/channels");
}

export async function createWebChatAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const rawAgentId = String(formData.get("agent_id") ?? "").trim() || null;
  const agentId = rawAgentId ?? (await defaultEmployeeIdForOrg(auth.orgId));

  const result = await createConnection({
    orgId: auth.orgId,
    siteName: String(formData.get("site_name") ?? "").trim() || null,
    // Asked for in the same breath as the snippet: an install with no domain answers nobody,
    // and a customer who discovers that later concludes the product is broken.
    allowedOrigins: String(formData.get("allowed_origins") ?? ""),
    assignedAgentId: agentId,
    createdBy: auth.userId,
  });

  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

export async function updateWebChatAction(
  connectionId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await updateConnection(auth.orgId, connectionId, {
    siteName: String(formData.get("site_name") ?? ""),
    allowedOrigins: String(formData.get("allowed_origins") ?? ""),
    displayName: String(formData.get("display_name") ?? ""),
    accentColor: String(formData.get("accent_color") ?? ""),
    greeting: String(formData.get("greeting") ?? ""),
  });

  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

export async function assignWebChatEmployeeAction(
  connectionId: string,
  agentId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await updateConnection(auth.orgId, connectionId, { assignedAgentId: agentId });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

/** Pause or resume the widget without losing its settings or its conversations. */
export async function setWebChatStatusAction(
  connectionId: string,
  status: "connected" | "disconnected"
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await updateConnection(auth.orgId, connectionId, { status });
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

/**
 * Issue a new site key.
 *
 * The remedy for a snippet that ended up somewhere the customer no longer controls. Every page
 * still carrying the old key stops working the moment this returns, which is the point — so the
 * UI says so before asking for a confirmation.
 */
export async function rotateWebChatKeyAction(
  connectionId: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await rotateSiteKey(auth.orgId, connectionId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

export async function removeWebChatAction(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await deleteConnection(auth.orgId, connectionId);
  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

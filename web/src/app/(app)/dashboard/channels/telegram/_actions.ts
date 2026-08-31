"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { connectBot, disconnectBot, assignEmployee } from "@/lib/telegram/connections";
import { defaultEmployeeIdForOrg } from "@/lib/platform/defaultEmployee";

/**
 * Telegram connect/disconnect actions.
 *
 * Owner/admin only, for the same reason as Instagram: the thing being handed over is a
 * credential that can post as the business. The token itself never leaves this action — it goes
 * straight to `connectBot`, which verifies it with Telegram and stores it encrypted. It is never
 * echoed back into the form, never logged, and never returned to the client.
 */

async function requireOrgAdmin(): Promise<{ ok: true; orgId: string; userId: string } | { ok: false; error: string }> {
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
    return { ok: false, error: "Only owners and admins can connect a Telegram bot" };
  }
  return { ok: true, orgId: profile.org_id, userId: user.id };
}

export async function connectTelegramAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const token = String(formData.get("token") ?? "");
  const rawAgentId = String(formData.get("agent_id") ?? "").trim() || null;
  // An explicit choice wins; otherwise the workspace's employee is assigned automatically.
  // An unassigned channel receives messages and answers none of them, and for the vast
  // majority of workspaces — which have exactly one employee — the dropdown was a question
  // with one possible answer.
  const agentId = rawAgentId ?? (await defaultEmployeeIdForOrg(auth.orgId));

  const result = await connectBot({
    orgId: auth.orgId,
    token,
    connectedBy: auth.userId,
    assignedAgentId: agentId,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard/channels/telegram");
  revalidatePath("/dashboard/channels");
  return { ok: true };
}

export async function disconnectTelegramAction(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await disconnectBot(auth.orgId, connectionId);
  revalidatePath("/dashboard/channels/telegram");
  revalidatePath("/dashboard/channels");
  return result;
}

export async function assignTelegramEmployeeAction(
  connectionId: string,
  agentId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await assignEmployee(auth.orgId, connectionId, agentId);
  revalidatePath("/dashboard/channels/telegram");
  return result;
}

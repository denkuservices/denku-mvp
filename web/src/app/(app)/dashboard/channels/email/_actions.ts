"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { startDomainVerification, refreshDomainStatus } from "@/lib/email/channel/domains";
import {
  createConnection,
  getConnectionById,
  disconnect,
  assignEmployee,
  setReplyMode,
  type ReplyMode,
} from "@/lib/email/channel/connections";

/**
 * Email connect/disconnect actions.
 *
 * Owner/admin only, like Telegram and Instagram. There is no credential to protect here — the
 * customer's mailbox stays theirs and we never hold a password — but a connection decides where
 * a business's customer mail is read and, once a domain is verified, what may be sent in their
 * name. That is an owner's decision.
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
    return { ok: false, error: "Only owners and admins can connect an email address" };
  }
  return { ok: true, orgId: profile.org_id, userId: user.id };
}

export async function connectEmailAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const forwardFromAddress = String(formData.get("forward_from_address") ?? "").trim();
  const agentId = String(formData.get("agent_id") ?? "").trim() || null;

  // The workspace name only shapes the readable half of the issued address, so a missing name
  // degrades to a generic slug rather than blocking the connection.
  const { data: org } = await supabaseAdmin
    .from("orgs")
    .select("name")
    .eq("id", auth.orgId)
    .maybeSingle<{ name: string | null }>();

  const result = await createConnection({
    orgId: auth.orgId,
    workspaceName: org?.name ?? null,
    forwardFromAddress,
    connectedBy: auth.userId,
    assignedAgentId: agentId,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard/channels/email");
  revalidatePath("/dashboard/channels");
  return { ok: true };
}

export async function disconnectEmailAction(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await disconnect(auth.orgId, connectionId);
  revalidatePath("/dashboard/channels/email");
  revalidatePath("/dashboard/channels");
  return result;
}

export async function assignEmailEmployeeAction(
  connectionId: string,
  agentId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const ok = await assignEmployee(auth.orgId, connectionId, agentId);
  revalidatePath("/dashboard/channels/email");
  return ok ? { ok: true } : { ok: false, error: "Could not save. Please try again." };
}

export async function setEmailReplyModeAction(
  connectionId: string,
  mode: ReplyMode
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (mode !== "draft" && mode !== "auto") return { ok: false, error: "Unknown reply mode" };

  const ok = await setReplyMode(auth.orgId, connectionId, mode);
  revalidatePath("/dashboard/channels/email");
  return ok ? { ok: true } : { ok: false, error: "Could not save. Please try again." };
}

export async function startDomainVerificationAction(
  connectionId: string,
  domain: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const result = await startDomainVerification({ orgId: auth.orgId, connectionId, domain });
  revalidatePath("/dashboard/channels/email");
  revalidatePath("/dashboard/channels");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/**
 * Ask the provider to re-read DNS.
 *
 * A button rather than a poll: DNS propagation is minutes to hours, and the person who just
 * pasted the records is the one who knows when to look again.
 */
export async function checkDomainAction(connectionId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const connection = await getConnectionById(connectionId);
  if (!connection || connection.orgId !== auth.orgId) return { ok: false, error: "Not found" };
  if (!connection.resendDomainId) return { ok: false, error: "Add a sending domain first." };

  const result = await refreshDomainStatus({
    orgId: auth.orgId,
    connectionId,
    domainId: connection.resendDomainId,
  });

  revalidatePath("/dashboard/channels/email");
  revalidatePath("/dashboard/channels");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

"use server";

import { revalidatePath } from "next/cache";
import {
  createConnection,
  deleteConnection,
  getConnectionById,
  rotateSiteKey,
  updateConnection,
} from "@/lib/webchat/connections";
import { defaultEmployeeIdForOrg } from "@/lib/platform/defaultEmployee";
import { guard } from "@/lib/auth/permissions";
import { MAX_AVATAR_BYTES, avatarExtension, deleteAvatar, isOwnedAvatar, storeAvatar } from "@/lib/webchat/branding";

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
  /**
   * One capability, read live with the service-role client.
   *
   * This used to be a hand-rolled `role !== "owner" && role !== "admin"` check against a profile
   * fetched through the cookie client — the exact shape landmine #16 was written about. `guard`
   * resolves the profile by id *then* auth_user_id (this repo carries both), treats an
   * unrecognised role as no role, and does not depend on an RLS policy staying permissive. The
   * capability is `manage_channels` because that is what editing an allowlist, a name or the face
   * of the widget on a customer's website actually is.
   */
  const gate = await guard("manage_channels");
  if (!gate.ok) return { ok: false, error: gate.denial.error };
  return { ok: true, orgId: gate.viewer.orgId, userId: gate.viewer.userId ?? "" };
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

  /**
   * Colours arrive as four separate fields and are stored as one object.
   *
   * An empty field means "no choice", not "black" — so it is dropped rather than stored, and the
   * widget's own default shows through. `updateConnection` sanitizes on the way in, so anything
   * that is not a hex colour never reaches the column.
   */
  const theme = {
    accent: String(formData.get("theme_accent") ?? "").trim() || undefined,
    surface: String(formData.get("theme_surface") ?? "").trim() || undefined,
    headerBg: String(formData.get("theme_headerBg") ?? "").trim() || undefined,
    headerText: String(formData.get("theme_headerText") ?? "").trim() || undefined,
  };

  const result = await updateConnection(auth.orgId, connectionId, {
    siteName: String(formData.get("site_name") ?? ""),
    allowedOrigins: String(formData.get("allowed_origins") ?? ""),
    displayName: String(formData.get("display_name") ?? ""),
    // Empty means "use the widget's own localised default", not "show nothing" — an empty string
    // is stored as NULL by `updateConnection`, which is what the widget reads as "not chosen".
    headerSubtitle: String(formData.get("header_subtitle") ?? ""),
    greeting: String(formData.get("greeting") ?? ""),
    theme,
  });

  if (!result.ok) return { ok: false, error: result.error };
  revalidate();
  return { ok: true };
}

/**
 * Replace the picture at the top of the chat panel.
 *
 * Separate from `updateWebChatAction` on purpose: that one is a settings form the owner presses
 * Save on, and it must not be the thing that re-uploads a 400 KB image every time somebody
 * corrects a typo in the greeting. Here, choosing a file IS the action.
 *
 * The old file is deleted only after the column has moved on. The reverse order has one failure
 * mode — a delete that succeeds and an update that does not — and it leaves the business's widget
 * pointing at bytes that are gone.
 */
export async function updateWebChatAvatarAction(
  connectionId: string,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image first." };
  if (!avatarExtension(file.type)) {
    return { ok: false, error: "Use a PNG, JPG or WebP image." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "That image is larger than 512 KB. Please use a smaller one." };
  }

  // Read against the workspace, so a connection id from another org resolves to nothing here
  // rather than to a row we then write an avatar onto.
  const connection = await getConnectionById(connectionId);
  if (!connection || connection.orgId !== auth.orgId) return { ok: false, error: "Missing connection." };

  const stored = await storeAvatar({
    orgId: auth.orgId,
    connectionId,
    mime: file.type.split(";")[0].trim().toLowerCase(),
    bytes: Buffer.from(await file.arrayBuffer()),
  });

  if (!stored.ok) {
    return {
      ok: false,
      error:
        stored.error === "unsupported_type"
          ? "That file is not a PNG, JPG or WebP image."
          : stored.error === "too_large"
            ? "That image is larger than 512 KB. Please use a smaller one."
            : "Could not save that image. Try again.",
    };
  }

  const result = await updateConnection(auth.orgId, connectionId, { avatarPath: stored.path });
  if (!result.ok) {
    // Nothing points at the file we just wrote, so it is litter — remove it rather than leave it.
    await deleteAvatar(stored.path);
    return { ok: false, error: result.error };
  }

  // Only now, and only if it was genuinely this connection's own file.
  if (isOwnedAvatar(connection.avatarPath, auth.orgId, connectionId)) {
    await deleteAvatar(connection.avatarPath);
  }

  console.info("[WEBCHAT][AVATAR][UPDATED]", { org_id: auth.orgId, connection_id: connectionId });
  revalidate();
  return { ok: true };
}

/** Go back to the built-in support-agent picture. */
export async function removeWebChatAvatarAction(
  connectionId: string
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireOrgAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };

  const connection = await getConnectionById(connectionId);
  if (!connection || connection.orgId !== auth.orgId) return { ok: false, error: "Missing connection." };

  const result = await updateConnection(auth.orgId, connectionId, { avatarPath: null });
  if (!result.ok) return { ok: false, error: result.error };

  if (isOwnedAvatar(connection.avatarPath, auth.orgId, connectionId)) {
    await deleteAvatar(connection.avatarPath);
  }
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

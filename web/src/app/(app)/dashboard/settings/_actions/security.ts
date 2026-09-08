"use server";

import { cookies } from "next/headers";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/auth/reauthenticate";
import { GATE_COOKIE_NAME } from "@/lib/auth/gateCookie";
import { notifyPasswordChanged } from "@/lib/notifications/securityNotifications";
import { getViewer } from "@/lib/auth/permissions";
import { logAuditEvent } from "@/lib/audit/log";

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: "Choose a password you have not used here before",
    path: ["password"],
  });

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Change the account password. Requires the current one.
 */
export async function changePassword(input: {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}): Promise<ChangePasswordResult> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Unauthorized" };
  if (!user.email) {
    return { ok: false, error: "This account has no email address, so the password cannot be changed here." };
  }

  const validation = ChangePasswordSchema.safeParse(input);
  if (!validation.success) {
    const firstMsg = validation.error.issues?.[0]?.message ?? "Validation error";
    return { ok: false, error: firstMsg };
  }

  const reauthenticated = await verifyPassword(user.email, validation.data.currentPassword);
  if (!reauthenticated) {
    const viewer = await getViewer();
    if (viewer.orgId) {
      // A failed re-authentication is a security event: it is what a session-borrowing attempt
      // looks like from the inside. Recorded, never thrown from.
      await logAuditEvent({
        org_id: viewer.orgId,
        actor_user_id: viewer.profileId,
        action: "security.password.reauth_failed",
        entity_type: "account",
        entity_id: viewer.orgId,
        diff: {},
      });
    }
    return { ok: false, error: "That current password is not right." };
  }

  const { error: updateErr } = await supabase.auth.updateUser({ password: validation.data.password });

  if (updateErr) {
    return { ok: false, error: `Failed to update password: ${updateErr.message}` };
  }

  // Tell the account owner, from the address they can trust. This is the more common of the two
  // change paths (the other is the reset link), and it is the one an attacker with a live session
  // would use — so it is exactly the case the notice exists for. Never throws: the password IS
  // changed here, and failing the action would say the opposite of the truth.
  await notifyPasswordChanged({ userId: user.id, email: user.email });

  const viewer = await getViewer();
  if (viewer.orgId) {
    await logAuditEvent({
      org_id: viewer.orgId,
      actor_user_id: viewer.profileId,
      action: "security.password.change",
      entity_type: "account",
      entity_id: viewer.orgId,
      diff: {},
    });
  }

  return { ok: true };
}

/**
 * Sign out all devices (global sign out).
 * Returns success status. Client should handle redirect.
 */
export async function signOutAllDevices(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  const viewer = await getViewer();
  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (error) {
    return { ok: false, error: `Failed to sign out: ${error.message}` };
  }

  // The middleware's cached gate decision goes with the session it describes (see
  // `lib/auth/gateCookie.ts`). It is user-id-bound, so this is hygiene rather than a hole.
  (await cookies()).delete(GATE_COOKIE_NAME);

  if (viewer.orgId) {
    await logAuditEvent({
      org_id: viewer.orgId,
      actor_user_id: viewer.profileId,
      action: "security.sessions.revoke_all",
      entity_type: "account",
      entity_id: viewer.orgId,
      diff: {},
    });
  }

  return { ok: true };
}

export type SessionRow = {
  id: string;
  createdAt: string;
  refreshedAt: string | null;
  userAgent: string | null;
  ip: string | null;
  /** aal2 means this session passed a second factor. */
  aal: string | null;
  /** True for the session this request is being made from. */
  current: boolean;
};

/**
 * The devices this account is signed in on.
 *
 * `auth.sessions` is not reachable through PostgREST — correctly, it holds every session on the
 * platform — so this goes through the `list_my_sessions` SECURITY DEFINER function, which filters
 * on `auth.uid()` inside its own body. Never throws: a workspace whose migration has not run yet
 * gets an empty list and keeps the "sign out everywhere" control it always had.
 *
 * Marking the CURRENT session matters more than it looks: without it, "sign out" on a row is a
 * coin flip about whether you are about to log yourself out.
 */
export async function listSessions(): Promise<SessionRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionRes } = await supabase.auth.getSession();
    // The access token's `session_id` claim names the session this request rides on.
    const currentSessionId = readSessionIdFromJwt(sessionRes?.session?.access_token ?? null);

    const { data, error } = await supabase.rpc("list_my_sessions");
    if (error || !Array.isArray(data)) return [];

    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      refreshedAt: r.refreshed_at ? String(r.refreshed_at) : null,
      userAgent: r.user_agent ? String(r.user_agent) : null,
      ip: r.ip ? String(r.ip) : null,
      aal: r.aal ? String(r.aal) : null,
      current: currentSessionId !== null && String(r.id) === currentSessionId,
    }));
  } catch {
    return [];
  }
}

/** Sign one device out. */
export async function revokeSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return { ok: false, error: "Unknown session" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("revoke_my_session", { p_session_id: sessionId });
    if (error) return { ok: false, error: "Could not sign that device out" };
    if (data === false) return { ok: false, error: "That session is no longer active" };

    const viewer = await getViewer();
    if (viewer.orgId) {
      await logAuditEvent({
        org_id: viewer.orgId,
        actor_user_id: viewer.profileId,
        action: "security.session.revoke",
        entity_type: "account",
        entity_id: viewer.orgId,
        diff: {},
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not sign that device out" };
  }
}

/**
 * The `session_id` claim out of the access token, without verifying it.
 *
 * Safe here precisely because nothing is authorized on the result: it decides which row gets a
 * "This device" label. The token was minted for this browser and re-verified by `getUser()`
 * elsewhere in the request; reading a display hint out of it needs no signature check, and doing
 * one would mean shipping the JWT secret into the app for no gain.
 */
function readSessionIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { session_id?: string };
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}

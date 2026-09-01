import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/auth/permissions";
import { isRole } from "@/lib/auth/permissions";

/**
 * The people in a workspace, and the rules about changing them.
 *
 * Everything that mutates membership funnels through here for one reason: **a workspace must never
 * end up with no owner.** There is exactly one route to that state — demoting or removing the last
 * one — and it has to be refused in every path that could reach it, not in whichever path someone
 * remembered. `assertNotLastOwner` is that refusal, and it counts owners at the moment of the
 * write rather than trusting a count the UI rendered a minute ago.
 */

export type Member = {
  profileId: string;
  email: string | null;
  fullName: string | null;
  role: Role | null;
  createdAt: string | null;
  /** From `auth.users` via the org_member_last_sign_in RPC. Null when unknown. */
  lastSignInAt: string | null;
};

export type Invite = {
  id: string;
  email: string;
  role: Role | null;
  createdAt: string;
  expiresAt: string | null;
  lastSentAt: string | null;
  /** Computed, not stored: an invite past its expiry is dead even while `status = 'pending'`. */
  expired: boolean;
};

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const lastSignIn = await lastSignInByProfile(orgId);

  return rows.map((r) => ({
    profileId: r.id as string,
    email: (r.email as string | null) ?? null,
    fullName: (r.full_name as string | null) ?? null,
    role: isRole(r.role) ? r.role : null,
    createdAt: (r.created_at as string | null) ?? null,
    lastSignInAt: lastSignIn.get(r.id as string) ?? null,
  }));
}

/**
 * Last sign-in per member, through the org-scoped SECURITY DEFINER function.
 *
 * Deliberately called with the **cookie client**, not the service-role one: the function
 * authorizes on `auth.uid()`, so calling it as the service role would pass no caller at all and
 * raise. Never throws — a workspace whose migration has not run yet simply shows no "last active"
 * column rather than failing the whole member list.
 */
async function lastSignInByProfile(orgId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("org_member_last_sign_in", { p_org_id: orgId });
    if (error || !Array.isArray(data)) return out;
    for (const row of data as Array<{ profile_id: string; last_sign_in_at: string | null }>) {
      if (row.last_sign_in_at) out.set(row.profile_id, row.last_sign_in_at);
    }
  } catch {
    /* best-effort */
  }
  return out;
}

export async function listInvites(orgId: string): Promise<Invite[]> {
  const { data, error } = await supabaseAdmin
    .from("org_invites")
    .select("id, email, role, created_at, expires_at, last_sent_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const now = Date.now();
  return data.map((r) => ({
    id: r.id as string,
    email: r.email as string,
    role: isRole(r.role) ? r.role : null,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    lastSentAt: (r.last_sent_at as string | null) ?? null,
    expired: Boolean(r.expires_at && Date.parse(r.expires_at as string) < now),
  }));
}

export async function countOwners(orgId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "owner");
  return count ?? 0;
}

export type MemberGuardFailure = { error: string; status: 400 | 403 | 404 | 409 };

/**
 * Refuse a change that would leave the workspace ownerless.
 *
 * Called before demoting or removing someone. Returns null when the change is safe.
 */
export async function assertNotLastOwner(
  orgId: string,
  target: { profileId: string; role: Role | null },
  verb: "remove" | "change the role of"
): Promise<MemberGuardFailure | null> {
  if (target.role !== "owner") return null;
  const owners = await countOwners(orgId);
  if (owners > 1) return null;
  return {
    status: 409,
    error: `You cannot ${verb} the only owner. Make someone else an owner first, or transfer ownership.`,
  };
}

/** The member row, scoped to the org — a member id from another workspace resolves to nothing. */
export async function findMember(
  orgId: string,
  profileId: string
): Promise<{ profileId: string; email: string | null; fullName: string | null; role: Role | null } | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("org_id", orgId)
    .eq("id", profileId)
    .maybeSingle<{ id: string; email: string | null; full_name: string | null; role: string | null }>();

  if (!data) return null;
  return {
    profileId: data.id,
    email: data.email,
    fullName: data.full_name,
    role: isRole(data.role) ? data.role : null,
  };
}

/** How a member is named in an audit row or a toast — never a bare uuid. */
export function memberLabel(m: { fullName?: string | null; email?: string | null }): string {
  return m.fullName?.trim() || m.email?.trim() || "this member";
}

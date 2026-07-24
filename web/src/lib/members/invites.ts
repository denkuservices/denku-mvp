import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Member invitations (Sprint 6, L4 / R-010). Org-scoped, service-role. Every function
 * degrades gracefully when the `org_invites` table is not yet applied (undefined_table →
 * a null/empty result, never a throw), so the app is safe before the migration is run — the
 * invite route then reports honestly that invites aren't enabled, rather than faking success.
 */

const UNDEFINED_TABLE = "42P01";
const PG_UNIQUE_VIOLATION = "23505";

export type InviteRole = "admin" | "owner";

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string | null;
}

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === UNDEFINED_TABLE || msg.includes("does not exist") || msg.includes("could not find the table");
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export interface CreateInviteResult {
  ok: boolean;
  token?: string;
  id?: string;
  /** Set when the feature is unavailable (migration not applied) or a real error occurred. */
  reason?: "not_enabled" | "duplicate" | "error";
}

/**
 * Create (or reuse) a pending invite for an email in an org. Idempotent on (org, email)
 * while pending. Returns not_enabled when the table isn't applied yet.
 */
export async function createInvite(
  input: { orgId: string; email: string; role: InviteRole; invitedBy: string | null },
  db: SupabaseClient = supabaseAdmin
): Promise<CreateInviteResult> {
  const email = input.email.trim().toLowerCase();
  if (!input.orgId || !email) return { ok: false, reason: "error" };

  const token = generateInviteToken();
  const insert = await db
    .from("org_invites")
    .insert({ org_id: input.orgId, email, role: input.role, token, invited_by: input.invitedBy, status: "pending" })
    .select("id, token")
    .single<{ id: string; token: string }>();

  if (insert.error) {
    if (tableMissing(insert.error)) return { ok: false, reason: "not_enabled" };
    if ((insert.error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      // A pending invite already exists — reuse it (idempotent from the caller's view).
      const existing = await db
        .from("org_invites")
        .select("id, token")
        .eq("org_id", input.orgId)
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle<{ id: string; token: string }>();
      if (existing.data) return { ok: true, token: existing.data.token, id: existing.data.id };
      return { ok: false, reason: "duplicate" };
    }
    console.error("[MEMBERS][INVITE][CREATE][FAILED]", insert.error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true, token: insert.data.token, id: insert.data.id };
}

export async function listPendingInvites(
  orgId: string,
  db: SupabaseClient = supabaseAdmin
): Promise<PendingInvite[]> {
  if (!orgId) return [];
  const { data, error } = await db
    .from("org_invites")
    .select("id, email, role, status, created_at, expires_at")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) return []; // includes table-missing → no pending invites shown
  return (data ?? []) as PendingInvite[];
}

/**
 * Consume a pending, unexpired invite for an email (acceptance at signup). Marks it accepted
 * and returns the org + role to attach the new user to. Null when there's no invite (or the
 * table isn't applied) → the user proceeds as a normal new-org signup.
 */
export async function consumeInviteForEmail(
  email: string,
  db: SupabaseClient = supabaseAdmin
): Promise<{ orgId: string; role: string } | null> {
  const norm = (email || "").trim().toLowerCase();
  if (!norm) return null;
  try {
    const { data, error } = await db
      .from("org_invites")
      .select("id, org_id, role, expires_at")
      .eq("email", norm)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; org_id: string; role: string; expires_at: string | null }>();
    if (error || !data) return null;
    if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return null;

    await db
      .from("org_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", data.id);
    return { orgId: data.org_id, role: data.role };
  } catch {
    return null;
  }
}

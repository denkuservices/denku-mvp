import "server-only";

import { cache } from "react";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Who may do what inside a workspace.
 *
 * Until now the answer lived nowhere: `/api/billing/plan/change` and `/api/billing/addons/update`
 * verified that SOMEONE was signed in and then charged their employer's card, and the invite route
 * hand-rolled its own `role !== "admin" && role !== "owner"` comparison against a column it read
 * with a different key than the billing routes used. A `viewer` could move a workspace onto a $899
 * plan; an `admin` could mint a second owner. Both are decisions the person paying the bill has to
 * be the one making.
 *
 * One matrix, one resolver, one refusal shape. Adding a capability means adding a row here — not
 * remembering which of a dozen routes forgot to check.
 *
 * **The role is read with the service-role client on purpose.** `profiles` is RLS-locked and a
 * viewer can read their own row, but authorization must not depend on a policy staying permissive:
 * if a future policy change hid `role`, an RLS-based check would start returning "no role" — which
 * this module reads as "not permitted", but only by luck. Read it from the source.
 */

export type Role = "owner" | "admin" | "viewer";

export const ROLES: readonly Role[] = ["owner", "admin", "viewer"] as const;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * The things a person can do to a workspace, named after the decision rather than the screen —
 * `manage_billing`, not `see_billing_page`, because the page is also where the invoice history a
 * viewer legitimately reads is shown.
 */
export type Capability =
  | "view_workspace"
  /** Rename the workspace, change default language/timezone/business hours. */
  | "manage_workspace_settings"
  /** Invite, re-invite, revoke, change a role, remove a member. */
  | "manage_members"
  /** Hand someone `owner`, or take it. Owner-only, always. */
  | "grant_owner"
  /** Change plan, buy/remove add-ons, open the Stripe portal, start a checkout. */
  | "manage_billing"
  /** Pause or resume the workspace (inbound calls actually stop). */
  | "manage_workspace_state"
  /** Read the audit log and export it. */
  | "view_audit_log"
  /** Connect/disconnect channels, rotate channel secrets. */
  | "manage_channels"
  /**
   * Connect/disconnect an e-commerce backend (IdeaSoft and its successors).
   *
   * Its own row rather than a reuse of `manage_channels`, because an integration is not a channel
   * (skills/commerce-integrations.md) and because the credentials differ in kind: a channel token
   * lets us answer messages, these credentials read a business's entire catalogue — and, on the
   * same grant, its orders, with customer names and addresses in them.
   */
  | "manage_integrations"
  /** Delete the workspace and everything in it. */
  | "delete_workspace";

const MATRIX: Record<Capability, readonly Role[]> = {
  view_workspace: ["owner", "admin", "viewer"],
  manage_workspace_settings: ["owner", "admin"],
  manage_members: ["owner", "admin"],
  grant_owner: ["owner"],
  manage_billing: ["owner", "admin"],
  manage_workspace_state: ["owner", "admin"],
  view_audit_log: ["owner", "admin"],
  manage_channels: ["owner", "admin"],
  manage_integrations: ["owner", "admin"],
  delete_workspace: ["owner"],
};

export function roleCan(role: Role | null, capability: Capability): boolean {
  if (!role) return false;
  return MATRIX[capability].includes(role);
}

/** Every capability a role holds — handed to client components so the UI hides what it must. */
export function capabilitiesFor(role: Role | null): Record<Capability, boolean> {
  const out = {} as Record<Capability, boolean>;
  for (const key of Object.keys(MATRIX) as Capability[]) out[key] = roleCan(role, key);
  return out;
}

export type Viewer = {
  /** The auth user id. Null when nobody is signed in. */
  userId: string | null;
  /** The `profiles` row id — the key member management writes against. */
  profileId: string | null;
  orgId: string | null;
  role: Role | null;
  email: string | null;
};

const EMPTY: Viewer = { userId: null, profileId: null, orgId: null, role: null, email: null };

/**
 * The signed-in person, their workspace and their role, in one round trip.
 *
 * `profiles` is keyed on `id` in most of this codebase and on `auth_user_id` in the billing routes
 * — the same user, found two different ways, and a workspace where the two diverge would authorize
 * differently depending on which route you hit. Both are tried here, `id` first (it matches the
 * dashboard pages and is what production actually holds), so there is one answer.
 *
 * Wrapped in React `cache`: a settings page asks for this from the layout, the page and two or
 * three sections, and `auth.getUser()` is an HTTP call to Supabase Auth, not a token decode.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  for (const col of ["id", "auth_user_id"] as const) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, org_id, role, email")
      .eq(col, user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; org_id: string | null; role: string | null; email: string | null }>();

    if (data?.org_id) {
      return {
        userId: user.id,
        profileId: data.id,
        orgId: data.org_id,
        // An unrecognised role string is NOT treated as a role. Fail closed: a typo in the column
        // must not read as "owner" just because it is not "viewer".
        role: isRole(data.role) ? data.role : null,
        email: data.email ?? user.email ?? null,
      };
    }
  }

  return { ...EMPTY, userId: user.id, email: user.email ?? null };
});

/** Convenience for server components: may the current viewer do this? */
export async function viewerCan(capability: Capability): Promise<boolean> {
  const viewer = await getViewer();
  return roleCan(viewer.role, capability);
}

export type Denial = { status: 401 | 403 | 400; error: string };

export type ResolvedViewer = Viewer & { orgId: string; role: Role; profileId: string };

export type GuardResult =
  | { ok: true; viewer: ResolvedViewer }
  | { ok: false; denial: Denial; response: NextResponse };

/**
 * The gate an API route puts in front of a privileged write.
 *
 * Returns the fully-resolved viewer on success so the route does not repeat the profile lookup,
 * and a ready-to-return `NextResponse` on failure so every refusal in the product has the same
 * `{ ok: false, error }` shape and the same status codes.
 */
export async function guard(capability: Capability): Promise<GuardResult> {
  const viewer = await getViewer();

  const deny = (denial: Denial): GuardResult => ({
    ok: false,
    denial,
    response: NextResponse.json({ ok: false, error: denial.error }, { status: denial.status }),
  });

  if (!viewer.userId) return deny({ status: 401, error: "Unauthorized" });
  if (!viewer.orgId || !viewer.profileId)
    return deny({ status: 400, error: "No workspace found for this account" });
  if (!roleCan(viewer.role, capability))
    return deny({ status: 403, error: DENIAL_COPY[capability] });

  return {
    ok: true,
    viewer: { ...viewer, orgId: viewer.orgId, role: viewer.role as Role, profileId: viewer.profileId },
  };
}

/**
 * What the refused person is told. Written for them, not for a log: it names the role that would
 * be needed, because "Forbidden" leaves someone staring at a button wondering if it is broken.
 */
const DENIAL_COPY: Record<Capability, string> = {
  view_workspace: "You do not have access to this workspace.",
  manage_workspace_settings: "Only owners and admins can change workspace settings.",
  manage_members: "Only owners and admins can manage members.",
  grant_owner: "Only the workspace owner can grant or transfer ownership.",
  manage_billing: "Only owners and admins can manage billing.",
  manage_workspace_state: "Only owners and admins can pause or resume the workspace.",
  view_audit_log: "Only owners and admins can view the audit log.",
  manage_channels: "Only owners and admins can manage channels.",
  manage_integrations: "Only owners and admins can connect a store or other integration.",
  delete_workspace: "Only the workspace owner can delete this workspace.",
};

export function denialCopy(capability: Capability): string {
  return DENIAL_COPY[capability];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  viewer: "Viewer",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Full control, including billing and ownership.",
  admin: "Manages settings, members, channels and billing.",
  viewer: "Reads conversations, calls and reports. Changes nothing.",
};

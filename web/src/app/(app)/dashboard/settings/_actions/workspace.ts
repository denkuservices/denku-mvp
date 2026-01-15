"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LANGUAGE_OPTIONS, getTimeZoneOptions } from "../_lib/options";
import { logAuditEvent } from "@/lib/audit/log";
import { logEvent } from "@/lib/observability/logEvent";
import {
  unbindOrgPhoneNumbers,
  rebindOrgPhoneNumbers,
} from "@/lib/vapi/phoneNumberBinding";

// Get valid language and timezone values for validation
const VALID_LANGUAGE_VALUES = LANGUAGE_OPTIONS.map((opt) => opt.value);
const VALID_TIMEZONE_VALUES = getTimeZoneOptions();

// Custom validation for language: normalize empty/undefined to null, then validate if non-null
const languageSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (!val || val === "" || (typeof val === "string" && val.trim() === "")) return null;
    return typeof val === "string" ? val.trim() : val;
  })
  .refine((val) => val === null || VALID_LANGUAGE_VALUES.includes(val), {
    message: "Invalid default language",
  });

// Custom validation for timezone: normalize empty/undefined to null, then validate if non-null
const timezoneSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (!val || val === "" || (typeof val === "string" && val.trim() === "")) return null;
    return typeof val === "string" ? val.trim() : val;
  })
  .refine((val) => val === null || VALID_TIMEZONE_VALUES.includes(val) || val === "UTC", {
    message: "Invalid timezone",
  });

// Validation schema
const UpdateWorkspaceGeneralSchema = z.object({
  workspace_name: z.string().trim().min(1).max(255),
  default_timezone: timezoneSchema,
  default_language: languageSchema,
  billing_email: z.union([z.string().email().trim().max(255), z.literal("")]).nullable(),
});

type UpdateWorkspaceGeneralInput = z.infer<typeof UpdateWorkspaceGeneralSchema>;

type OrganizationSettings = {
  id: string;
  org_id: string;
  name: string | null;
  default_timezone: string | null;
  default_language: string | null;
  billing_email: string | null;
  workspace_status: "active" | "paused";
  paused_at: string | null;
  paused_reason: "manual" | "hard_cap" | "past_due" | null;
  created_at: string;
  updated_at: string;
};

type Profile = {
  id: string;
  org_id: string | null;
  role: "owner" | "admin" | "viewer";
};

type Organization = {
  id: string;
  name: string;
};

type UpdateWorkspaceGeneralSuccess = {
  workspace_name: string;
  default_timezone: string | null;
  default_language: string | null;
  billing_email: string | null;
};

export type UpdateWorkspaceGeneralResult =
  | { ok: true; data: UpdateWorkspaceGeneralSuccess }
  | { ok: false; error: string };

/**
 * Get workspace general settings for the current user's org.
 * Returns orgId, role, orgName, and settings.
 */
export async function getWorkspaceGeneral() {
  const supabase = await createSupabaseServerClient();
  
  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 2) Get profile with org_id (and role if exists) - use auth_user_id and handle duplicates
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role, updated_at, created_at")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (profErr) {
    throw new Error(`Failed to load profile: ${profErr.message}`);
  }

  // Handle duplicates: pick the most recently updated profile
  let profile: Profile | null = null;
  if (profiles && profiles.length > 0) {
    profile = {
      id: profiles[0].id,
      org_id: profiles[0].org_id,
      role: profiles[0].role,
    };
    // Log warning if duplicates exist
    if (profiles.length > 1) {
      console.warn(`[getWorkspaceGeneral] Found ${profiles.length} profiles for auth_user_id ${user.id}, using most recent`);
    }
  } else {
    // No profile found - this should not happen in normal flow, but handle gracefully
    throw new Error("No profile found for this user. Please contact support.");
  }

  if (!profile?.org_id) {
    throw new Error("No org found for this user.");
  }
  
  const orgId: string = profile.org_id; // ensure non-null type
  const role = profile.role;
  
  // 3) Get organization name (using orgs table as source of truth)
  const { data: org, error: orgErr } = await supabase
    .from("orgs")
    .select("id, name")
    .eq("id", orgId)
    .single<Organization>();
  
  if (orgErr) {
    throw new Error(`Failed to load organization: ${orgErr.message}`);
  }
  
  const orgName = org?.name ?? "";

  // 4) Get organization_settings for this org
  const { data: settings, error: settingsErr } = await supabase
    .from("organization_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle<OrganizationSettings>();

  if (settingsErr) {
    throw new Error(`Failed to load settings: ${settingsErr.message}`);
  }

  return {
    orgId,
    role,
    orgName,
    settings: settings || null,
  };
}

/**
 * Update workspace general settings.
 * Enforces role-based access (owner/admin only).
 * Uses RLS-enforced client (NOT service role).
 * Returns discriminated union: { ok: true, data } | { ok: false, error }
 */
export async function updateWorkspaceGeneral(input: UpdateWorkspaceGeneralInput): Promise<UpdateWorkspaceGeneralResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Unauthorized: keep as throw for redirect
    throw new Error("Unauthorized");
  }

  // 2) Validate input
  const validation = UpdateWorkspaceGeneralSchema.safeParse(input);
  if (!validation.success) {
    const firstMsg = validation.error.issues?.[0]?.message ?? "Validation error";
    return { ok: false, error: firstMsg };
  }
  const validated = validation.data;

  // 3) Get profile with org_id and role - use auth_user_id and handle duplicates
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role, updated_at, created_at")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (profErr) {
    return { ok: false, error: `Failed to load profile: ${profErr.message}` };
  }

  let profile: Profile | null = null;
  if (profiles && profiles.length > 0) {
    profile = {
      id: profiles[0].id,
      org_id: profiles[0].org_id,
      role: profiles[0].role,
    };
    if (profiles.length > 1) {
      console.warn(`[updateWorkspaceGeneral] Found ${profiles.length} profiles for auth_user_id ${user.id}, using most recent`);
    }
  }

  if (!profile) {
    return { ok: false, error: "No profile found for this user." };
  }

  if (!profile?.org_id) {
    return { ok: false, error: "No org found for this user." };
  }

  const orgId: string = profile.org_id;
  const role = profile.role;

  // 4) Check role (owner/admin required for write) - explicit gate
  const canWrite = role === "owner" || role === "admin";
  if (!canWrite) {
    return { ok: false, error: "Forbidden: Only owners and admins can update workspace settings." };
  }

  // 5) Fetch existing data for audit diff (before update)
  const { data: existingOrg, error: orgFetchErr } = await supabase
    .from("orgs")
    .select("name")
    .eq("id", orgId)
    .single<{ name: string }>();

  if (orgFetchErr) {
    return { ok: false, error: `Failed to fetch organization: ${orgFetchErr.message}` };
  }

  const { data: existingSettings } = await supabase
    .from("organization_settings")
    .select("default_timezone, default_language, billing_email")
    .eq("org_id", orgId)
    .maybeSingle<{
      default_timezone: string | null;
      default_language: string | null;
      billing_email: string | null;
    }>();

  // 6) Update orgs.name (source of truth)
  const { error: orgUpdateErr } = await supabase
    .from("orgs")
    .update({ name: validated.workspace_name.trim() })
    .eq("id", orgId);

  if (orgUpdateErr) {
    return { ok: false, error: `Failed to update workspace name: ${orgUpdateErr.message}` };
  }

  // 7) Normalize empty strings to null for optional fields
  const billingEmail = validated.billing_email === "" ? null : validated.billing_email;

  // 8) Upsert organization_settings (single transaction-safe statement, scoped by org_id)
  const { data: updated, error: upsertErr } = await supabase
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        default_timezone: validated.default_timezone,
        default_language: validated.default_language,
        billing_email: billingEmail,
      },
      {
        onConflict: "org_id",
      }
    )
    .select()
    .single<OrganizationSettings>();

  if (upsertErr) {
    return { ok: false, error: `Failed to update settings: ${upsertErr.message}` };
  }

  // 9) Compute field-level diff for audit log
  const settingsDiff: Record<string, { before: unknown; after: unknown }> = {};

  // Check workspace_name change (organizations.name)
  const oldWorkspaceName = existingOrg?.name ?? null;
  const newWorkspaceName = validated.workspace_name.trim();
  if (oldWorkspaceName !== newWorkspaceName) {
    settingsDiff.workspace_name = { before: oldWorkspaceName, after: newWorkspaceName };
  }

  // Check default_timezone change
  const oldTimezone = existingSettings?.default_timezone ?? null;
  const newTimezone = validated.default_timezone;
  if (oldTimezone !== newTimezone) {
    settingsDiff.default_timezone = { before: oldTimezone, after: newTimezone };
  }

  // Check default_language change
  const oldLanguage = existingSettings?.default_language ?? null;
  const newLanguage = validated.default_language;
  if (oldLanguage !== newLanguage) {
    settingsDiff.default_language = { before: oldLanguage, after: newLanguage };
  }

  // Check billing_email change
  const oldBillingEmail = existingSettings?.billing_email ?? null;
  const newBillingEmail = billingEmail;
  if (oldBillingEmail !== newBillingEmail) {
    settingsDiff.billing_email = { before: oldBillingEmail, after: newBillingEmail };
  }

  // 10) Log audit event if there are changes
  if (Object.keys(settingsDiff).length > 0) {
    await logAuditEvent({
      org_id: orgId,
      actor_user_id: user.id,
      action: "settings.update",
      entity_type: "workspace.general",
      entity_id: orgId,
      diff: settingsDiff,
    });
  }

  return {
    ok: true,
    data: {
      workspace_name: newWorkspaceName,
      default_timezone: newTimezone,
      default_language: newLanguage,
      billing_email: newBillingEmail,
    },
  };
}

/**
 * Pause or resume workspace.
 * Enforces role-based access (owner/admin only).
 * Returns discriminated union: { ok: true, data } | { ok: false, error }
 */
export async function toggleWorkspaceStatus(
  action: "pause" | "resume"
): Promise<{ ok: true; data: { workspace_status: "active" | "paused"; paused_at: string | null } } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // 2) Get profile with org_id and role - use auth_user_id and handle duplicates
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role, updated_at, created_at")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);

  if (profErr) {
    return { ok: false, error: `Failed to load profile: ${profErr.message}` };
  }

  let profile: Profile | null = null;
  if (profiles && profiles.length > 0) {
    profile = {
      id: profiles[0].id,
      org_id: profiles[0].org_id,
      role: profiles[0].role,
    };
    if (profiles.length > 1) {
      console.warn(`[toggleWorkspaceStatus] Found ${profiles.length} profiles for auth_user_id ${user.id}, using most recent`);
    }
  }

  if (!profile) {
    return { ok: false, error: "No profile found for this user." };
  }

  if (!profile?.org_id) {
    return { ok: false, error: "No org found for this user." };
  }

  const orgId: string = profile.org_id;
  const role = profile.role;

  // 3) Check role (owner/admin required)
  const canWrite = role === "owner" || role === "admin";
  if (!canWrite) {
    return { ok: false, error: "Forbidden: Only owners and admins can pause/resume workspace." };
  }

  // 4) Fetch existing settings for audit diff and resume validation
  // Use supabaseAdmin (service role) to ensure RLS doesn't block the fetch
  const { data: existingSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status, paused_at, paused_reason")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused";
      paused_at: string | null;
      paused_reason: "manual" | "hard_cap" | "past_due" | null;
    }>();

  const oldStatus = existingSettings?.workspace_status ?? "active";
  const newStatus = action === "pause" ? "paused" : "active";
  const newPausedAt = action === "pause" ? new Date().toISOString() : null;
  const newPausedReason = action === "pause" ? "manual" : null;

  // 4a) Backend enforcement: Block resume if paused_reason is billing-related
  // Only allow resume if paused_reason is null or 'manual'
  if (newStatus === "active" && oldStatus === "paused") {
    const pausedReason = existingSettings?.paused_reason;
    if (pausedReason === "hard_cap" || pausedReason === "past_due") {
      // Billing issue - cannot resume manually
      logEvent({
        tag: "[WORKSPACE][RESUME_BLOCKED]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "warn",
        details: {
          paused_reason: pausedReason,
          user_id: user.id,
          attempted_action: "resume",
        },
      });

      return {
        ok: false,
        error: "Billing issue. Update payment method to resume.",
      };
    }
  }

  // 5) Upsert organization_settings with new status
  // Use supabaseAdmin for service role access
  const { data: updated, error: upsertErr } = await supabaseAdmin
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        workspace_status: newStatus,
        paused_at: newPausedAt,
        paused_reason: newPausedReason,
      },
      {
        onConflict: "org_id",
      }
    )
    .select()
    .single<OrganizationSettings>();

  if (upsertErr) {
    return { ok: false, error: `Failed to update workspace status: ${upsertErr.message}` };
  }

  // 6) Handle Vapi assistants (CRITICAL: Stop all calls)
  if (oldStatus !== newStatus) {
    try {
      if (action === "pause") {
        // Pause: Unbind phone numbers from assistants (prevents calls)
        await unbindOrgPhoneNumbers(orgId, "manual");

        // Log audit event for manual pause
        try {
          const { data: agents } = await supabaseAdmin
            .from("agents")
            .select("id")
            .eq("org_id", orgId)
            .not("vapi_assistant_id", "is", null)
            .not("vapi_phone_number_id", "is", null);

          if (agents && agents.length > 0) {
            for (const agent of agents) {
              await logAuditEvent({
                org_id: orgId,
                actor_user_id: user.id,
                action: "vapi.assistants.disabled",
                entity_type: "agent",
                entity_id: agent.id,
                diff: {
                  vapi_sync_status: {
                    before: null,
                    after: "paused",
                  },
                },
              });
            }
          }
        } catch (auditErr) {
          // Don't fail if audit logging fails
          console.error("[WORKSPACE STATUS] Audit logging failed:", auditErr);
        }
      } else {
        // Resume: Re-bind phone numbers to assistants
        // rebindOrgPhoneNumbers has guard - will not rebind if billing-paused
        await rebindOrgPhoneNumbers(orgId);

        // Log audit event for manual resume
        try {
          const { data: agents } = await supabaseAdmin
            .from("agents")
            .select("id")
            .eq("org_id", orgId)
            .not("vapi_assistant_id", "is", null)
            .not("vapi_phone_number_id", "is", null);

          if (agents && agents.length > 0) {
            for (const agent of agents) {
              await logAuditEvent({
                org_id: orgId,
                actor_user_id: user.id,
                action: "vapi.assistants.enabled",
                entity_type: "agent",
                entity_id: agent.id,
                diff: {
                  vapi_sync_status: {
                    before: "paused",
                    after: "success",
                  },
                },
              });
            }
          }
        } catch (auditErr) {
          // Don't fail if audit logging fails
          console.error("[WORKSPACE STATUS] Audit logging failed:", auditErr);
        }
      }
    } catch (vapiErr) {
      console.error("[WORKSPACE STATUS] Vapi assistant update failed:", vapiErr);
      // Don't fail the entire operation if Vapi update fails
      // The workspace status is already updated in DB
    }
  }

  // 7) Log audit event for workspace status change
  if (oldStatus !== newStatus) {
    await logAuditEvent({
      org_id: orgId,
      actor_user_id: user.id,
      action: action === "pause" ? "workspace.paused" : "workspace.resumed",
      entity_type: "workspace.controls",
      entity_id: orgId,
      diff: {
        workspace_status: {
          before: oldStatus,
          after: newStatus,
        },
        ...(action === "pause" && {
          paused_at: {
            before: existingSettings?.paused_at ?? null,
            after: newPausedAt,
          },
        }),
      },
    });
  }

  return {
    ok: true,
    data: {
      workspace_status: newStatus,
      paused_at: newPausedAt,
    },
  };
}

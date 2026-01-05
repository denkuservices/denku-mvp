"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LANGUAGE_OPTIONS, getTimeZoneOptions } from "../_lib/options";
import { logAuditEvent } from "@/lib/audit/log";

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
  greeting_override: z.union([z.string().trim().min(1).max(255), z.literal("")]).nullable(),
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
  greeting_override: string | null;
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

  // 2) Get profile with org_id (and role if exists)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single<Profile>();

  if (profErr) {
    throw new Error(`Failed to load profile: ${profErr.message}`);
  }

  if (!profile?.org_id) {
    throw new Error("No org found for this user.");
  }
  
  const orgId: string = profile.org_id; // ensure non-null type
  const role = profile.role;
  
  // 3) Get organization name
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
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

  // 3) Get profile with org_id and role
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single<Profile>();

  if (profErr) {
    return { ok: false, error: `Failed to load profile: ${profErr.message}` };
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
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .single<{ name: string }>();

  if (orgFetchErr) {
    return { ok: false, error: `Failed to fetch organization: ${orgFetchErr.message}` };
  }

  const { data: existingSettings } = await supabase
    .from("organization_settings")
    .select("default_timezone, default_language, billing_email, name")
    .eq("org_id", orgId)
    .maybeSingle<{
      default_timezone: string | null;
      default_language: string | null;
      billing_email: string | null;
      name: string | null;
    }>();

  // 6) Update organizations.name (source of truth)
  const { error: orgUpdateErr } = await supabase
    .from("organizations")
    .update({ name: validated.workspace_name.trim() })
    .eq("id", orgId);

  if (orgUpdateErr) {
    return { ok: false, error: `Failed to update workspace name: ${orgUpdateErr.message}` };
  }

  // 7) Normalize empty strings to null for optional fields
  const greetingOverride = validated.greeting_override === "" ? null : validated.greeting_override;
  const billingEmail = validated.billing_email === "" ? null : validated.billing_email;

  // 8) Upsert organization_settings (single transaction-safe statement, scoped by org_id)
  const { data: updated, error: upsertErr } = await supabase
    .from("organization_settings")
    .upsert(
      {
        org_id: orgId,
        name: greetingOverride,
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

  // Check greeting_override change (organization_settings.name)
  const oldGreetingOverride = existingSettings?.name ?? null;
  const newGreetingOverride = greetingOverride;
  if (oldGreetingOverride !== newGreetingOverride) {
    settingsDiff.name = { before: oldGreetingOverride, after: newGreetingOverride };
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
      greeting_override: newGreetingOverride,
      default_timezone: newTimezone,
      default_language: newLanguage,
      billing_email: newBillingEmail,
    },
  };
}

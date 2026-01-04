"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Validation schema
const UpdateWorkspaceGeneralSchema = z.object({
  workspace_name: z.string().trim().min(1).max(255),
  greeting_override: z.union([z.string().trim().min(1).max(255), z.literal("")]).nullable(),
  default_timezone: z.string().trim().max(100).nullable(),
  default_language: z.string().trim().max(100).nullable(),
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
 */
export async function updateWorkspaceGeneral(input: UpdateWorkspaceGeneralInput) {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // 2) Validate input
  const validation = UpdateWorkspaceGeneralSchema.safeParse(input);
  if (!validation.success) {
    throw new Error(`Validation error: ${validation.error.message}`);
  }

  const validated = validation.data;

  // 3) Get profile with org_id and role
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

  const orgId: string = profile.org_id;
  const role = profile.role;

  // 4) Check role (owner/admin required for write) - explicit gate
  const canWrite = role === "owner" || role === "admin";
  if (!canWrite) {
    throw new Error("Forbidden: Only owners and admins can update workspace settings.");
  }

  // 5) Update organizations.name (source of truth)
  const { error: orgUpdateErr } = await supabase
    .from("organizations")
    .update({ name: validated.workspace_name.trim() })
    .eq("id", orgId);

  if (orgUpdateErr) {
    throw new Error(`Failed to update workspace name: ${orgUpdateErr.message}`);
  }

  // 6) Normalize empty strings to null for optional fields
  const greetingOverride = validated.greeting_override === "" ? null : validated.greeting_override;
  const billingEmail = validated.billing_email === "" ? null : validated.billing_email;

  // 7) Upsert organization_settings (single transaction-safe statement, scoped by org_id)
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
    throw new Error(`Failed to update settings: ${upsertErr.message}`);
  }

  return {
    workspace_name: validated.workspace_name.trim(),
    greeting_override: greetingOverride, // string | null
    default_timezone: validated.default_timezone ? validated.default_timezone.trim() : null,
    default_language: validated.default_language ? validated.default_language.trim() : null,
    billing_email: billingEmail, // string | null (normalize edilmiş)
  };
  
}

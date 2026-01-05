"use client";

import type React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateWorkspaceGeneral, type UpdateWorkspaceGeneralResult } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { getTimeZoneOptions } from "@/app/(app)/dashboard/settings/_lib/options";
import { LanguageSelect } from "./LanguageSelect";
import { TimezoneCombobox } from "./TimezoneCombobox";

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

type WorkspaceGeneralFormProps = {
  initialSettings: OrganizationSettings | null;
  role: "owner" | "admin" | "viewer";
  orgId: string;
  orgName: string;
  onTimezoneUpdate?: (timezone: string | null) => void;
};

type FormState = {
  workspace_name: string;
  default_timezone: string;
  default_language: string;
  billing_email: string;
};

export function WorkspaceGeneralForm({
  initialSettings,
  role,
  orgId,
  orgName,
  onTimezoneUpdate,
}: WorkspaceGeneralFormProps) {
  const isReadOnly = role === "viewer";
  const router = useRouter();

  // Get timezone options for datalist
  const timezoneOptions = getTimeZoneOptions();

  // Initialize form state from settings
  const getInitialState = (): FormState => ({
    workspace_name: orgName || "",
    default_timezone: initialSettings?.default_timezone || "",
    default_language: initialSettings?.default_language || "",
    billing_email: initialSettings?.billing_email || "",
  });

  const [formState, setFormState] = useState<FormState>(getInitialState);
  const [initialState, setInitialState] = useState<FormState>(getInitialState);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Check if form is dirty
  const isDirty =
    formState.workspace_name !== initialState.workspace_name ||
    formState.default_timezone !== initialState.default_timezone ||
    formState.default_language !== initialState.default_language ||
    formState.billing_email !== initialState.billing_email;

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
    setStatus(null);
  };

  const handleCancel = () => {
    setFormState(initialState);
    setStatus(null);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isDirty) return;

    startTransition(async () => {
      try {
        // Prepare payload (never send undefined keys)
        const payload = {
          workspace_name: formState.workspace_name.trim(),
          default_timezone: formState.default_timezone.trim() || null,
          default_language: formState.default_language.trim() || null,
          billing_email: formState.billing_email.trim() || null,
        };

        const result = await updateWorkspaceGeneral(payload);

        if (!result.ok) {
          // Handle error case
          setStatus({ type: "error", message: result.error });
          return;
        }

        // Handle success case
        const updated = result.data;

        // Update initial state to reflect saved changes
        const newInitialState: FormState = {
          workspace_name: updated.workspace_name || "",
          default_timezone: updated.default_timezone || "",
          default_language: updated.default_language || "",
          billing_email: updated.billing_email || "",
        };

        setInitialState(newInitialState);
        setFormState(newInitialState);

        setStatus({ type: "success", message: "Settings saved successfully." });

        // Update Runtime card immediately via callback
        onTimezoneUpdate?.(updated.default_timezone);

        // Refresh server components to keep data in sync
        router.refresh();

        // Reset status after 3 seconds
        setTimeout(() => setStatus(null), 3000);
      } catch (error) {
        // Catch unexpected errors (e.g., unauthorized redirect)
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : "Failed to save settings.";
        setStatus({ type: "error", message });
      }
    });
  };


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Status message */}
      {status && (
        <div
          className={`rounded-xl border p-4 ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Workspace name"
          value={formState.workspace_name}
          onChange={(v) => handleChange("workspace_name", v)}
          helper="Your organization's name (required). Used across the platform."
          readOnly={isReadOnly}
          required
        />

        <LanguageSelect
          label="Default language"
          value={formState.default_language}
          onChange={(v) => handleChange("default_language", v)}
          helper="Default for new agents. Individual agents can override."
          readOnly={isReadOnly}
        />

        <TimezoneCombobox
          label="Timezone"
          value={formState.default_timezone}
          onChange={(v) => handleChange("default_timezone", v)}
          helper="Used for reporting, logs, and scheduling behavior."
          readOnly={isReadOnly}
          timezoneOptions={timezoneOptions}
        />

        <Field
          label="Billing email"
          value={formState.billing_email}
          onChange={(v) => handleChange("billing_email", v)}
          helper="Email address for billing notifications."
          readOnly={isReadOnly}
          type="email"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {isReadOnly ? (
          <p className="text-xs text-zinc-500">
            You have read-only access. Only owners and admins can modify workspace settings.
          </p>
        ) : (
          <>
            <p className="text-xs text-zinc-500">{isDirty ? "You have unsaved changes." : "All changes saved."}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!isDirty || isPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!isDirty || isPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  helper,
  readOnly,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        required={required && !readOnly}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-50"
      />
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}



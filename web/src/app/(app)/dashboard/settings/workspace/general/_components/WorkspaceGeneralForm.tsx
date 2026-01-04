"use client";

import type React from "react";
import { useState, useTransition } from "react";
import { updateWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";
import { LANGUAGE_OPTIONS, getTimeZoneOptions } from "@/app/(app)/dashboard/settings/_lib/options";

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
};

type FormState = {
  workspace_name: string;
  greeting_override: string;
  default_timezone: string;
  default_language: string;
  billing_email: string;
};

type UpdateWorkspaceGeneralResult = {
  workspace_name: string | null;
  greeting_override: string | null;
  default_timezone: string | null;
  default_language: string | null;
  billing_email: string | null;
};

export function WorkspaceGeneralForm({
  initialSettings,
  role,
  orgId,
  orgName,
}: WorkspaceGeneralFormProps) {
  const isReadOnly = role === "viewer";

  // Get timezone options for datalist
  const timezoneOptions = getTimeZoneOptions();

  // Initialize form state from settings (workspace_name from orgName, greeting_override from settings.name)
  const getInitialState = (): FormState => ({
    workspace_name: orgName || "",
    greeting_override: initialSettings?.name || "",
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
    formState.greeting_override !== initialState.greeting_override ||
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
          greeting_override: formState.greeting_override.trim() || null,
          default_timezone: formState.default_timezone.trim() || null,
          default_language: formState.default_language.trim() || null,
          billing_email: formState.billing_email.trim() || null,
        };

        const updated = (await updateWorkspaceGeneral(payload)) as UpdateWorkspaceGeneralResult;

        // Update initial state to reflect saved changes
        const newInitialState: FormState = {
          workspace_name: updated.workspace_name || "",
          greeting_override: updated.greeting_override || "",
          default_timezone: updated.default_timezone || "",
          default_language: updated.default_language || "",
          billing_email: updated.billing_email || "",
        };

        setInitialState(newInitialState);
        setFormState(newInitialState);

        setStatus({ type: "success", message: "Settings saved successfully." });

        // Reset status after 3 seconds
        setTimeout(() => setStatus(null), 3000);
      } catch (error) {
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

  // Determine display name for greeting (greeting_override || workspace_name)
  const displayName =
    formState.greeting_override.trim() || formState.workspace_name.trim() || orgName || "your company";

  return (
    <form onSubmit={handleSubmit}>
      {/* Status message */}
      {status && (
        <div
          className={`mb-6 rounded-xl border p-4 ${
            status.type === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label="Workspace name"
          value={formState.workspace_name}
          onChange={(v) => handleChange("workspace_name", v)}
          helper="Your organization's name (required). Used across the platform."
          readOnly={isReadOnly}
          required
        />

        <LanguageField
          label="Default language"
          value={formState.default_language}
          onChange={(v) => handleChange("default_language", v)}
          helper="Default for new agents. Individual agents can override."
          readOnly={isReadOnly}
        />

        <TimezoneField
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

      <div className="mt-4">
        <Field
          label="Greeting override (optional)"
          value={formState.greeting_override}
          onChange={(v) => handleChange("greeting_override", v)}
          helper="Optional custom name for agent greetings. If empty, workspace name is used."
          readOnly={isReadOnly}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-sm font-semibold text-zinc-900">First-message injection</p>
        <p className="mt-1 text-sm text-zinc-600">
          We can automatically prepend your company name to agent greetings. Example:
        </p>
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-800">
            "Hello, thanks for calling <span className="font-semibold">{displayName}</span>. How can I
            help you today?"
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
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

function LanguageField({
  label,
  value,
  onChange,
  helper,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={readOnly}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-50"
      >
        <option value="">Select a language</option>
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}

function TimezoneField({
  label,
  value,
  onChange,
  helper,
  readOnly,
  timezoneOptions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
  timezoneOptions: string[];
}) {
  const datalistId = "timezone-list";
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <input
        type="text"
        list={datalistId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        placeholder="Type or select a timezone"
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm disabled:cursor-not-allowed disabled:bg-zinc-50"
      />
      <datalist id={datalistId}>
        {timezoneOptions.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}

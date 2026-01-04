"use client";

import { useState, useTransition } from "react";
import { updateWorkspaceGeneral } from "@/app/(app)/dashboard/settings/_actions/workspace";

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
  role: string | null;
  orgId: string;
};

type FormState = {
  name: string;
  default_timezone: string;
  default_language: string;
  billing_email: string;
};

export function WorkspaceGeneralForm({ initialSettings, role, orgId }: WorkspaceGeneralFormProps) {
  const isReadOnly = role !== null && role !== "owner" && role !== "admin";

  // Initialize form state from settings
  const getInitialState = (): FormState => ({
    name: initialSettings?.name || "",
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
    formState.name !== initialState.name ||
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
        // Normalize empty strings to null for nullable fields
        const payload = {
          name: formState.name.trim() || null,
          default_timezone: formState.default_timezone.trim() || null,
          default_language: formState.default_language.trim() || null,
          billing_email: formState.billing_email.trim() || null,
        };

        const updated = await updateWorkspaceGeneral(payload);

        // Update initial state to reflect saved changes
        const newInitialState: FormState = {
          name: updated.name || "",
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
        const message = error instanceof Error ? error.message : "Failed to save settings.";
        setStatus({ type: "error", message });
      }
    });
  };

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
          label="Company name"
          value={formState.name}
          onChange={(v) => handleChange("name", v)}
          helper="Single source of truth. Used for first-message injection (recommended)."
          readOnly={isReadOnly}
        />
        <Field
          label="Default language"
          value={formState.default_language}
          onChange={(v) => handleChange("default_language", v)}
          helper="Default for new agents. Individual agents can override."
          readOnly={isReadOnly}
        />
        <Field
          label="Timezone"
          value={formState.default_timezone}
          onChange={(v) => handleChange("default_timezone", v)}
          helper="Used for reporting, logs, and scheduling behavior."
          readOnly={isReadOnly}
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

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-sm font-semibold text-zinc-900">First-message injection</p>
        <p className="mt-1 text-sm text-zinc-600">
          We can automatically prepend your company name to agent greetings. Example:
        </p>
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-800">
            "Hello, thanks for calling <span className="font-semibold">{formState.name || "Your Company"}</span>. How can I
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
            <p className="text-xs text-zinc-500">
              {isDirty ? "You have unsaved changes." : "All changes saved."}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={!isDirty || isPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isDirty || isPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  readOnly: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-zinc-900">{label}</p>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm disabled:bg-zinc-50 disabled:cursor-not-allowed"
      />
      {helper ? <p className="text-xs text-zinc-500">{helper}</p> : null}
    </div>
  );
}


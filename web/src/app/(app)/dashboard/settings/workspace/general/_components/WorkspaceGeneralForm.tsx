"use client";

import type React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Eye,
  Loader2,
  Mail,
  Save,
  Undo2,
} from "lucide-react";
import {
  updateWorkspaceGeneral,
} from "@/app/(app)/dashboard/settings/_actions/workspace";
import { getTimeZoneOptions } from "@/app/(app)/dashboard/settings/_lib/options";
import {
  INPUT_WITH_ICON_CLASS,
  IconField,
  Notice,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { LanguageSelect } from "./LanguageSelect";
import { TimezoneCombobox } from "./TimezoneCombobox";

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

type WorkspaceGeneralFormProps = {
  initialSettings: OrganizationSettings | null;
  role: "owner" | "admin" | "viewer";
  orgId: string;
  orgName: string;
};

type FormState = {
  workspace_name: string;
  default_timezone: string;
  default_language: string;
  billing_email: string;
};

/**
 * Workspace identity.
 *
 * **What the visual pass changed.** Every field was a bare label over a bare box, so four controls
 * that mean four different things (a name, a language, a place, an address) looked identical —
 * each now carries the glyph of what it is. And the action row had no hierarchy at all: Cancel and
 * Save rendered as the same white outline, which is the one place in a settings form where the
 * affirmative action has to be obvious. Save is `brand-500`; Cancel is the quiet one; the whole
 * row only appears once the form is dirty, so a page you are only reading has no buttons shouting
 * at you.
 *
 * The `onTimezoneUpdate` callback is gone with the Runtime card it fed — the two facts that card
 * showed are header pills now, and the page refreshes through `router.refresh()` like everything
 * else.
 */
export function WorkspaceGeneralForm({
  initialSettings,
  role,
  orgName,
}: WorkspaceGeneralFormProps) {
  const isReadOnly = role === "viewer";
  const router = useRouter();

  const timezoneOptions = getTimeZoneOptions();

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
          setStatus({ type: "error", message: result.error });
          return;
        }

        const updated = result.data;

        const newInitialState: FormState = {
          workspace_name: updated.workspace_name || "",
          default_timezone: updated.default_timezone || "",
          default_language: updated.default_language || "",
          billing_email: updated.billing_email || "",
        };

        setInitialState(newInitialState);
        setFormState(newInitialState);
        setStatus({ type: "success", message: "Workspace settings saved." });

        // Refresh server components to keep data in sync
        router.refresh();

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
      {status ? (
        <Notice
          tone={status.type === "success" ? "ok" : "critical"}
          icon={status.type === "success" ? CheckCircle2 : AlertCircle}
        >
          {status.message}
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <IconField
          id="workspace-name"
          icon={Building2}
          label="Workspace name"
          helper="How your AI introduces your business on a call."
          required
        >
          <input
            id="workspace-name"
            type="text"
            value={formState.workspace_name}
            onChange={(e) => handleChange("workspace_name", e.target.value)}
            readOnly={isReadOnly}
            disabled={isReadOnly}
            required={!isReadOnly}
            placeholder="Acme Dental"
            className={INPUT_WITH_ICON_CLASS}
          />
        </IconField>

        <LanguageSelect
          label="Default language"
          value={formState.default_language}
          onChange={(v) => handleChange("default_language", v)}
          helper="Starting point for new employees; each can override it."
          readOnly={isReadOnly}
        />

        <TimezoneCombobox
          label="Timezone"
          value={formState.default_timezone}
          onChange={(v) => handleChange("default_timezone", v)}
          helper="Used when your AI talks about your hours."
          readOnly={isReadOnly}
          timezoneOptions={timezoneOptions}
        />

        <IconField
          id="billing-email"
          icon={Mail}
          label="Billing email"
          helper="Where invoices and payment notices are sent."
        >
          <input
            id="billing-email"
            type="email"
            value={formState.billing_email}
            onChange={(e) => handleChange("billing_email", e.target.value)}
            readOnly={isReadOnly}
            disabled={isReadOnly}
            placeholder="billing@yourbusiness.com"
            className={INPUT_WITH_ICON_CLASS}
          />
        </IconField>
      </div>

      {isReadOnly ? (
        <Notice tone="info" icon={Eye} title="Read-only access">
          Only owners and admins can change workspace settings.
        </Notice>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-white/10">
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            {isDirty ? (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                You have unsaved changes.
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                All changes saved.
              </>
            )}
          </p>
          <div className="flex gap-2">
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={handleCancel}
              disabled={!isDirty || isPending}
            >
              <Undo2 />
              Discard
            </SettingsButton>
            <SettingsButton type="submit" variant="primary" disabled={!isDirty || isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save changes"}
            </SettingsButton>
          </div>
        </div>
      )}
    </form>
  );
}

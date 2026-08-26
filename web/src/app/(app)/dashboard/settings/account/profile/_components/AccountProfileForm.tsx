"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  Phone,
  Save,
  Undo2,
  UserRound,
} from "lucide-react";
import {
  IconField,
  INPUT_WITH_ICON_CLASS,
  Notice,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";

interface AccountProfileFormProps {
  fullName: string;
  phone: string;
  email: string;
  onSubmit: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Your name, email and phone.
 *
 * Three identical boxes became three fields that look like what they hold, and the email — which
 * cannot be edited here — is now *visibly* locked rather than merely greyed out with a sentence
 * underneath explaining why nothing happens when you click it. Save follows the same rule as every
 * other form on the surface: brand-coloured, and only offered once something has actually changed.
 */
export function AccountProfileForm({
  fullName: initialFullName,
  phone: initialPhone,
  email,
  onSubmit,
}: AccountProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);

  const isDirty = fullName !== initialFullName || phone !== initialPhone;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("full_name", fullName ?? "");
    formData.set("phone", phone ?? "");

    startTransition(async () => {
      const result = await onSubmit(formData);

      if (result.ok) {
        setSuccess(true);
        router.refresh();
        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(false), 2000);
      } else {
        setError(result.error || "Failed to save changes");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <IconField
          id="full_name"
          icon={UserRound}
          label="Full name"
          helper="Shown to your teammates on this workspace."
        >
          <input
            type="text"
            id="full_name"
            name="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isPending}
            maxLength={120}
            placeholder="Jamie Rivera"
            className={INPUT_WITH_ICON_CLASS}
          />
        </IconField>

        <div className="space-y-2">
          <label
            htmlFor="account-email"
            className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 dark:text-white"
          >
            Email
            <Lock aria-hidden="true" className="h-3 w-3 text-gray-400" />
          </label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              id="account-email"
              type="email"
              readOnly
              disabled
              value={email}
              className={`${INPUT_WITH_ICON_CLASS} cursor-not-allowed`}
            />
          </div>
          <p className="text-xs text-gray-500">Managed by your authentication provider.</p>
        </div>

        <IconField id="phone" icon={Phone} label="Phone" helper="Optional — used for account contact only.">
          <input
            type="text"
            id="phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            maxLength={32}
            placeholder="+1 555 010 0199"
            className={INPUT_WITH_ICON_CLASS}
          />
        </IconField>
      </div>

      {error ? (
        <Notice tone="critical" icon={AlertCircle}>
          {error}
        </Notice>
      ) : null}

      {success ? (
        <Notice tone="ok" icon={CheckCircle2}>
          Profile updated.
        </Notice>
      ) : null}

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
            onClick={() => {
              setFullName(initialFullName);
              setPhone(initialPhone);
              setError(null);
            }}
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
    </form>
  );
}

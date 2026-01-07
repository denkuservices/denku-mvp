"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface AccountProfileFormProps {
  fullName: string;
  phone: string;
  email: string;
  onSubmit: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
}

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
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EditableField
            label="Full name"
            name="full_name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isPending}
            maxLength={120}
          />
          <ReadOnlyField label="Email" value={email} />
          <EditableField
            label="Phone"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
            maxLength={32}
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-800">Profile updated successfully.</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {success ? "Changes saved." : "Changes will be saved to your account."}
          </p>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </>
  );
}

function EditableField({
  label,
  name,
  value,
  onChange,
  disabled,
  maxLength,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-semibold text-foreground">
        {label}
      </label>
      <input
        type="text"
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        maxLength={maxLength}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground">{label}</label>
      <input
        type="email"
        readOnly
        value={value}
        disabled
        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-base shadow-sm opacity-60 cursor-not-allowed"
      />
      <p className="text-xs text-muted-foreground">Email is managed by your authentication provider.</p>
    </div>
  );
}


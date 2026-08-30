"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { updatePasswordAction } from "./updatePasswordAction";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await updatePasswordAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        // Recovery session is now a full session — go straight into the app.
        router.push("/dashboard");
      }
    });
  };

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Enter a new password for your account."
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          Need a new link?{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/forgot-password">
            Request another
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder="At least 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder="Re-enter your new password"
          />
        </div>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[10px] bg-[var(--s-cta-bg)] py-3.5 font-medium text-[var(--s-cta-fg)] transition-all hover:bg-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

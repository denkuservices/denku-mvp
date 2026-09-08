"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { updatePasswordAction } from "./updatePasswordAction";

export default function ResetPasswordPage() {
  const t = useTranslations("auth.reset");
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
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          {t("needLink")}{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/forgot-password">
            {t("requestAnother")}
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder={t("passwordPlaceholder")}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            {t("confirmLabel")}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder={t("confirmPlaceholder")}
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
          {isPending ? t("submitting") : t("submit")}
        </button>
      </form>
    </AuthShell>
  );
}

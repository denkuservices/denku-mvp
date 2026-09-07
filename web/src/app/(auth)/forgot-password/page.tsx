"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth/AuthShell";
import { requestPasswordResetAction } from "./requestPasswordResetAction";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  // Prefilled when the customer arrived from a signup or sign-in that already knew the address.
  const prefilledEmail = useSearchParams().get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSent(true);
      }
    });
  };

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      showBackLink
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          {t("remembered")}{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/login">
            {t("backToSignIn")}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="rounded-[10px] border border-[var(--s-accent-ring)] bg-[var(--s-accent-soft)] p-4">
          <p className="text-sm text-[var(--s-ink)]">
            {t("sent")}
          </p>
        </div>
      ) : (
        <form action={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
              {t("emailLabel")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={prefilledEmail}
              autoComplete="email"
              className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
              placeholder={t("emailPlaceholder")}
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
      )}
    </AuthShell>
  );
}

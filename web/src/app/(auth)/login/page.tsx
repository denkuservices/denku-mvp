"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginAction, type LoginResult } from "./loginAction";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export default function LoginPage() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  /*
   * Carry the address across from a signup that refused to send.
   *
   * Signup now tells a customer who already has an account to sign in instead. Making them retype
   * the address they just typed would undo half of what that message is for — and the value is
   * only ever prefilled into a field they can edit, never acted on, so nothing rests on it.
   */
  const searchParams = useSearchParams();
  const prefilledEmail = searchParams.get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result: LoginResult = await loginAction(formData);
      
      if (!result.ok) {
        // Show error message
        setError(result.error);
      } else {
        // Success - redirect happens server-side, but handle client-side too for safety
        if (result.next === "dashboard") {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      }
    });
  };

  return (
    <AuthShell
      title={t("title")}
      subtitle={t("subtitle")}
      showBackLink
      secondary={<SocialAuthButtons surface="dark" />}
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          {t("noAccount")}{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/signup">
            {t("createAccount")}
          </Link>
        </p>
      }
    >
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

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder={t("passwordPlaceholder")}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              value="1"
              className="h-4 w-4 rounded border-[var(--s-border)] text-[var(--s-accent)] focus:ring-[var(--s-accent-ring)]"
            />
            <label htmlFor="remember" className="ml-2 text-sm text-[var(--s-ink-faint)]">
              {t("remember")}
            </label>
          </div>
          <Link
            href={prefilledEmail ? `/forgot-password?email=${encodeURIComponent(prefilledEmail)}` : "/forgot-password"}
            className="text-sm text-[var(--s-ink-faint)] underline-offset-2 transition-colors hover:text-[var(--s-accent)] hover:underline"
          >
            {t("forgot")}
          </Link>
        </div>

        {/* Error message */}
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

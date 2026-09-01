"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { sendCodeAction } from "../sendCodeAction";

/**
 * The signup form.
 *
 * **The "already registered" state is a first-class outcome, not an error.** Typing the address
 * you already have an account with is one of the most ordinary things a person does on a signup
 * page — usually because they forgot they had signed up. It used to be answered by Supabase
 * quietly mailing a magic link (the template it picks for a known address) which signed them into
 * a dashboard they were not expecting to see. Now nothing is sent and the page says so, in the
 * language the rest of the page is written in.
 *
 * It is deliberately styled as information rather than as failure: nothing went wrong, and a red
 * box would tell the reader they had made a mistake when in fact they have an account.
 *
 * The email travels to `/login` as a query param so the one thing they were asked for is not
 * asked for again.
 */
export function SignupForm() {
  const router = useRouter();
  const t = useTranslations("auth.signup");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** The address we refused to mail, kept so the sign-in link can carry it. */
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setRegisteredEmail(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email")?.toString()?.trim() || "";

    if (!email || !email.includes("@")) {
      setError(t("invalidEmail"));
      return;
    }

    startTransition(async () => {
      const result = await sendCodeAction(formData);

      if (result.ok) {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }

      if (result.code === "ALREADY_REGISTERED") {
        setRegisteredEmail(email);
        return;
      }

      setError(result.error);
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending}
            autoComplete="email"
            onChange={() => {
              // Editing the address makes both messages stale — neither is about what is in the
              // box any more.
              setError(null);
              setRegisteredEmail(null);
            }}
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] disabled:opacity-60"
            placeholder={t("emailPlaceholder")}
          />
          <p className="mt-1 text-xs text-[var(--s-ink-faint)]">{t("emailHint")}</p>
        </div>

        {registeredEmail && (
          <div
            role="status"
            className="rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3"
          >
            <p className="flex items-start gap-2 text-sm font-medium text-[var(--s-ink)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--s-accent)]" aria-hidden="true" />
              {t("alreadyRegisteredTitle")}
            </p>
            <p className="mt-1 pl-6 text-sm text-[var(--s-ink-soft)]">{t("alreadyRegisteredBody")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 pl-6">
              <Link
                href={`/login?email=${encodeURIComponent(registeredEmail)}`}
                className="text-sm font-medium text-[var(--s-accent)] underline-offset-2 hover:underline"
              >
                {t("goToSignIn")}
              </Link>
              <Link
                href={`/forgot-password?email=${encodeURIComponent(registeredEmail)}`}
                className="text-sm text-[var(--s-ink-faint)] underline-offset-2 hover:underline"
              >
                {t("forgotPassword")}
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[10px] bg-[var(--s-cta-bg)] py-3.5 font-medium text-[var(--s-cta-fg)] transition-all hover:bg-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? t("submitting") : t("submit")}
        </button>
      </form>
    </>
  );
}

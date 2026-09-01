"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sendCodeAction } from "../../signup/sendCodeAction";

interface VerifyEmailInputFormProps {
  onEmailSet: (email: string) => void;
}

export function VerifyEmailInputForm({ onEmailSet }: VerifyEmailInputFormProps) {
  const router = useRouter();
  // The same two sentences the signup form uses — one wording, one translation, one meaning.
  const t = useTranslations("auth.signup");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** True once we refused to send because the address already has an account. */
  const [registered, setRegistered] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("email", trimmedEmail);
      const result = await sendCodeAction(formData);
      if (result.ok) {
        onEmailSet(trimmedEmail);
        // Update URL without reload
        router.push(`/verify-email?email=${encodeURIComponent(trimmedEmail)}`);
        return;
      }

      /*
       * Same refusal as the signup form, because it is the same action and the same rule: a
       * finished account is never mailed anything from here.
       *
       * This form is for somebody who lost their code mid-signup, so in practice it is only
       * reached by a registered person who wandered in — and sending them to sign in is the
       * answer they need. Kept as a plain sentence rather than the signup form's full panel;
       * this is a rescue screen, not the front door.
       */
      if (result.code === "ALREADY_REGISTERED") {
        setRegistered(true);
        return;
      }

      setError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-[var(--s-ink)] mb-1.5">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setRegistered(false);
          }}
          disabled={isPending}
          required
          autoComplete="email"
          className="w-full rounded-xl border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:border-[var(--s-accent)] disabled:opacity-60 transition-colors"
          placeholder="you@company.com"
        />
      </div>

      {registered && (
        <div
          role="status"
          className="rounded-xl border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3"
        >
          <p className="text-sm font-medium text-[var(--s-ink)]">{t("alreadyRegisteredTitle")}</p>
          <p className="mt-1 text-sm text-[var(--s-ink-soft)]">{t("alreadyRegisteredBody")}</p>
          <Link
            href={`/login?email=${encodeURIComponent(email.trim())}`}
            className="mt-2 inline-block text-sm font-medium text-[var(--s-accent)] underline-offset-2 hover:underline"
          >
            {t("goToSignIn")}
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !email.trim()}
        className="w-full rounded-xl bg-[var(--s-cta-bg)] text-white py-3.5 font-medium hover:bg-[var(--s-accent)] active:bg-[var(--s-accent-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Sending..." : "Send verification email"}
      </button>

      <div className="text-center">
        <Link
          className="text-sm text-[var(--s-ink-soft)] hover:text-[var(--s-ink)] underline transition-colors"
          href="/signup"
        >
          Go to signup
        </Link>
      </div>
    </form>
  );
}


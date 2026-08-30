"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginAction, type LoginResult } from "./loginAction";
import { AuthShell } from "@/components/auth/AuthShell";
import { SocialAuthButtons } from "@/components/auth/SocialAuthButtons";

export default function LoginPage() {
  const router = useRouter();
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
      title="Sign In"
      subtitle="Enter your email and password to sign in!"
      showBackLink
      secondary={<SocialAuthButtons surface="dark" />}
      footer={
        <p className="text-sm text-[var(--s-ink-faint)]">
          Not registered yet?{" "}
          <Link className="font-medium text-[var(--s-accent)] underline-offset-2 hover:underline" href="/signup">
            Create an account
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[var(--s-ink)]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-[10px] border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] transition-colors focus:border-[var(--s-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)]"
            placeholder="Your password"
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
              Keep me logged in
            </label>
          </div>
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--s-ink-faint)] underline-offset-2 transition-colors hover:text-[var(--s-accent)] hover:underline"
          >
            Forgot Password?
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
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

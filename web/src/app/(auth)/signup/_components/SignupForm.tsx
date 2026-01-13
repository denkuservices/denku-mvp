"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signupAction } from "../signupAction";

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get("password")?.toString() || "";
    const confirmPassword = formData.get("confirm_password")?.toString() || "";

    // Client-side validation: password length
    if (password.length < 8) {
      setError({ message: "Password must be at least 8 characters." });
      return;
    }

    // Client-side validation: password match
    if (password !== confirmPassword) {
      setError({ message: "Passwords do not match." });
      return;
    }

    // Remove confirm_password from FormData (server doesn't need it)
    formData.delete("confirm_password");

    startTransition(async () => {
      const result = await signupAction(formData);

      if (result.ok) {
        // Redirect based on next step
        if (result.next === "dashboard") {
          router.push("/dashboard");
        } else {
          router.push(`/verify-email?email=${encodeURIComponent(result.email)}`);
        }
      } else {
        // Set error for display
        setError({ code: result.code, message: result.error });
      }
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="org_name" className="block text-sm font-medium text-slate-900">
            Business name
          </label>
          <input
            id="org_name"
            name="org_name"
            required
            disabled={isPending}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="Acme Inc."
          />
        </div>

        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-slate-900">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            required
            disabled={isPending}
            autoComplete="name"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="Alex Johnson"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-slate-900">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            disabled={isPending}
            autoComplete="tel"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="+1 (555) 123-4567"
          />
          <p className="mt-1 text-xs text-slate-500">
            For recovery and notifications.
          </p>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-900">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending}
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-900">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            disabled={isPending}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div>
          <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-900">
            Confirm password
          </label>
          <input
            id="confirm_password"
            name="confirm_password"
            type="password"
            required
            minLength={8}
            disabled={isPending}
            autoComplete="new-password"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300 disabled:opacity-60"
            placeholder="Confirm your password"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            {error.code === "USER_EXISTS" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-800">Account already exists</p>
                <p className="text-sm text-red-700">
                  This email is already registered. Please sign in, or use "Forgot password" to reset your password.
                </p>
                <div className="flex gap-3 mt-2">
                  <Link
                    href="/login"
                    className="text-sm text-red-800 underline hover:text-red-900 transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/login?forgot=1"
                    className="text-sm text-red-800 underline hover:text-red-900 transition-colors"
                  >
                    Forgot password
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-800">{error.message}</p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-black text-white py-2.5 font-medium hover:bg-slate-900 active:bg-black focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-200">
        <p className="text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="underline hover:text-slate-900 transition-colors" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}


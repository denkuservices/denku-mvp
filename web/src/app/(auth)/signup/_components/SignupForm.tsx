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
          <label className="text-sm font-medium">Business name</label>
          <input
            name="org_name"
            required
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="Kevin LLC"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Full name</label>
          <input
            name="full_name"
            required
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="Ali Dinç"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Phone number</label>
          <input
            name="phone"
            type="tel"
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="+1 (555) 123-4567"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used for account recovery and notifications.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            name="email"
            type="email"
            required
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Confirm password</label>
          <input
            name="confirm_password"
            type="password"
            required
            minLength={8}
            disabled={isPending}
            className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
            placeholder="Confirm your password"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
            {error.code === "USER_EXISTS" ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-red-800">Account already exists</p>
                <p className="text-sm text-red-700">
                  This email is already registered. Please sign in, or use "Forgot password" to reset your password.
                </p>
                <div className="flex gap-3 mt-2">
                  <Link
                    href="/login"
                    className="text-sm text-red-800 underline hover:text-red-900"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/login?forgot=1"
                    className="text-sm text-red-800 underline hover:text-red-900"
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
          className="w-full rounded-md bg-black text-white py-2 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="underline" href="/login">
          Sign in
        </Link>
      </p>
    </>
  );
}


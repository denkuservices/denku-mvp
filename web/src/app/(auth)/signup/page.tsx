"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signupAction } from "./signupAction";

export default function SignupPage() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await signupAction(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create account");
      }
    });
  };

  return (
    <div className="rounded-2xl border p-6 shadow-sm bg-white">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Create your workspace and start configuring agents.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium">Workspace name</label>
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

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
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
    </div>
  );
}

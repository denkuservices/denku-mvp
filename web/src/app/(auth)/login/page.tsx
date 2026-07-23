"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginAction, type LoginResult } from "./loginAction";
import { AuthShell } from "@/components/auth/AuthShell";

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
      footer={
        <p className="text-sm text-[#6B7888]">
          Not registered yet?{" "}
          <Link className="font-medium text-[#1B6E6E] underline-offset-2 hover:underline" href="/signup">
            Create an account
          </Link>
        </p>
      }
    >
      <form action={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#0A1A2F]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/15"
            placeholder="you@company.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#0A1A2F]">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/15"
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
              className="h-4 w-4 rounded border-[#0A1A2F]/20 text-[#1B6E6E] focus:ring-[#1B6E6E]/20"
            />
            <label htmlFor="remember" className="ml-2 text-sm text-[#6B7888]">
              Keep me logged in
            </label>
          </div>
          <Link
            href="/forgot-password"
            className="text-sm text-[#6B7888] underline-offset-2 transition-colors hover:text-[#1B6E6E] hover:underline"
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
          className="w-full rounded-[10px] bg-[#0A1A2F] py-3.5 font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

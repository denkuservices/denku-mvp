"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { requestPasswordResetAction } from "./requestPasswordResetAction";

export default function ForgotPasswordPage() {
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
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to set a new password."
      showBackLink
      footer={
        <p className="text-sm text-[#6B7888]">
          Remembered it?{" "}
          <Link className="font-medium text-[#1B6E6E] underline-offset-2 hover:underline" href="/login">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="rounded-[10px] border border-[#1B6E6E]/20 bg-[#1B6E6E]/[0.06] p-4">
          <p className="text-sm text-[#0A1A2F]">
            If an account exists for that email, a password reset link is on its way.
            Check your inbox (and spam folder) and follow the link to choose a new password.
          </p>
        </div>
      ) : (
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
            {isPending ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

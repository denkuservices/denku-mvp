"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCodeAction } from "../sendCodeAction";

export function SignupForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email")?.toString()?.trim() || "";

    // Client-side validation: email format
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    startTransition(async () => {
      const result = await sendCodeAction(formData);

      if (result.ok) {
        // Redirect to verify-email page with email query param
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        // Set error for display
        setError(result.error);
      }
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#0A1A2F]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={isPending}
            autoComplete="email"
            className="w-full rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-3 text-[#0A1A2F] placeholder:text-[#6B7888]/70 transition-colors focus:border-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/15 disabled:opacity-60"
            placeholder="you@company.com"
          />
          <p className="mt-1 text-xs text-[#6B7888]">
            We'll email you an 8-digit code.
          </p>
        </div>

        {error && (
          <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-[10px] bg-[#0A1A2F] py-3.5 font-medium text-[#F7F5F1] transition-all hover:bg-[#1B6E6E] focus:outline-none focus:ring-2 focus:ring-[#1B6E6E]/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Sending code..." : "Continue"}
        </button>
      </form>
    </>
  );
}


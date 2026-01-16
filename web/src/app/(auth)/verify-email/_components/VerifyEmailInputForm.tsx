"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resendSignupEmailAction } from "../_actions/resendSignupEmail";

interface VerifyEmailInputFormProps {
  onEmailSet: (email: string) => void;
}

export function VerifyEmailInputForm({ onEmailSet }: VerifyEmailInputFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      const result = await resendSignupEmailAction(trimmedEmail);
      if (result.ok) {
        onEmailSet(trimmedEmail);
        // Update URL without reload
        router.push(`/verify-email?email=${encodeURIComponent(trimmedEmail)}`);
      } else {
        setError(result.error);
        if (result.code === "USER_EXISTS") {
          // Redirect to login after showing error
          setTimeout(() => {
            router.push("/login");
          }, 2000);
        }
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-1.5">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          disabled={isPending}
          required
          autoComplete="email"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-slate-300 disabled:opacity-60 transition-colors"
          placeholder="you@company.com"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !email.trim()}
        className="w-full rounded-xl bg-indigo-600 text-white py-3.5 font-medium hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Sending..." : "Send verification email"}
      </button>

      <div className="text-center">
        <Link
          className="text-sm text-slate-600 hover:text-slate-900 underline transition-colors"
          href="/signup"
        >
          Go to signup
        </Link>
      </div>
    </form>
  );
}


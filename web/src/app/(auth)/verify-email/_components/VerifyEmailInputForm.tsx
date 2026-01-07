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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Email address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          disabled={isPending}
          required
          className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
          placeholder="you@company.com"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || !email.trim()}
        className="w-full rounded-md bg-black text-white py-2 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Sending..." : "Send verification email"}
      </button>

      <div className="text-center">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground underline"
          href="/signup"
        >
          Go to signup
        </Link>
      </div>
    </form>
  );
}


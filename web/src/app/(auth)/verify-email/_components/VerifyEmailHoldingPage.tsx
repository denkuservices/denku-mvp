"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { resendSignupEmailAction } from "../_actions/resendSignupEmail";
import { checkConfirmedAction } from "../_actions/checkConfirmed";

interface VerifyEmailHoldingPageProps {
  email: string;
}

export function VerifyEmailHoldingPage({ email }: VerifyEmailHoldingPageProps) {
  const [resendCooldown, setResendCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCheckingConfirmed, setIsCheckingConfirmed] = useState(false);

  const handleResend = async () => {
    if (resendCooldown > 0 || isPending) return;

    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await resendSignupEmailAction(email);
      if (result.ok) {
        setMessage(result.message);
        setResendCooldown(10); // 10 second cooldown
        const interval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(result.error);
        // No longer check for USER_EXISTS code - just show error
      }
    });
  };

  const handleCheckConfirmed = async () => {
    setIsCheckingConfirmed(true);
    setError(null);
    setMessage(null);

    try {
      await checkConfirmedAction();
      // If not redirected, user is still not confirmed
      setMessage("Still not confirmed yet. Please check your email and click the confirmation link.");
    } catch (err) {
      // Redirect happened (expected)
    } finally {
      setIsCheckingConfirmed(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800">
          We sent a confirmation email to{" "}
          <span className="font-medium">{email}</span>. Open your inbox and click the confirmation link.
        </p>
      </div>

      {message && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-800">{message}</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isPending}
          className="w-full rounded-xl bg-indigo-600 text-white py-3.5 px-4 font-medium hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {resendCooldown > 0
            ? `Resend email in ${resendCooldown}s`
            : "Resend confirmation email"}
        </button>

        <button
          type="button"
          onClick={handleCheckConfirmed}
          disabled={isCheckingConfirmed || isPending}
          className="w-full rounded-xl border border-slate-200 bg-white text-slate-700 py-3.5 px-4 font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isCheckingConfirmed ? "Checking..." : "I already confirmed"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setError(null);
            window.location.href = "/verify-email";
          }}
          className="w-full rounded-xl border border-slate-200 bg-white text-slate-700 py-3.5 px-4 font-medium hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          Change email
        </button>
      </div>

      <div className="pt-4 border-t border-slate-200 flex gap-3 justify-center">
        <Link
          className="text-sm text-slate-600 hover:text-slate-900 underline transition-colors"
          href="/login"
        >
          Go to login
        </Link>
        <span className="text-sm text-slate-400">•</span>
        <Link
          className="text-sm text-slate-600 hover:text-slate-900 underline transition-colors"
          href="/signup"
        >
          Use a different email
        </Link>
      </div>
    </div>
  );
}


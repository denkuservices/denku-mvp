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
        if (result.code === "USER_EXISTS") {
          // Show sign in link for existing users
          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);
        }
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
    <div className="space-y-4">
      <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3">
        <p className="text-sm text-blue-800">
          We sent a confirmation email to{" "}
          <span className="font-medium">{email}</span>. Open your inbox and click the confirmation link.
        </p>
      </div>

      {message && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm text-green-800">{message}</p>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isPending}
          className="w-full rounded-md bg-black text-white py-2 px-4 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {resendCooldown > 0
            ? `Resend email in ${resendCooldown}s`
            : "Resend confirmation email"}
        </button>

        <button
          type="button"
          onClick={handleCheckConfirmed}
          disabled={isCheckingConfirmed || isPending}
          className="w-full rounded-md border border-gray-300 bg-white text-gray-700 py-2 px-4 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
          className="w-full rounded-md border border-gray-300 bg-white text-gray-700 py-2 px-4 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Change email
        </button>
      </div>

      <div className="pt-4 border-t flex gap-3 justify-center">
        <Link
          className="text-sm text-muted-foreground hover:text-foreground underline"
          href="/login"
        >
          Go to login
        </Link>
        <span className="text-sm text-muted-foreground">•</span>
        <Link
          className="text-sm text-muted-foreground hover:text-foreground underline"
          href="/signup"
        >
          Use a different email
        </Link>
      </div>
    </div>
  );
}


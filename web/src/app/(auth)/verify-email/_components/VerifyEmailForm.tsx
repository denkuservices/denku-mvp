"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyOtpAction, resendCodeAction } from "../_actions/verify";

interface VerifyEmailFormProps {
  email: string;
  onVerified: (needsPassword: boolean) => void;
}

export function VerifyEmailForm({ email, onVerified }: VerifyEmailFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (code.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }

    startTransition(async () => {
      const result = await verifyOtpAction(email, code);
      if (result.ok) {
        // After OTP verification, proceed to password step if needed
        // Otherwise, redirect to dashboard (email is confirmed)
        if (result.needsPassword) {
          onVerified(result.needsPassword);
        } else {
          // Email confirmed and password exists, redirect to dashboard
          router.push("/dashboard");
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setError(null);
    const result = await resendCodeAction(email);
    if (result.ok) {
      setResendCooldown(60); // 60 second cooldown
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
      setError(result.error || "Failed to resend code");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium">Verification code</label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => {
            const value = e.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(value);
            setError(null);
          }}
          disabled={isPending}
          className="mt-1 w-full rounded-md border px-3 py-2 text-center text-2xl tracking-widest disabled:opacity-60"
          placeholder="000000"
          autoFocus
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Enter the 6-digit code sent to {email}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending || code.length !== 6}
        className="w-full rounded-md bg-black text-white py-2 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Verifying..." : "Verify"}
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || isPending}
          className="text-sm text-muted-foreground hover:text-foreground underline disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {resendCooldown > 0
            ? `Resend code in ${resendCooldown}s`
            : "Resend verification code"}
        </button>
      </div>
    </form>
  );
}


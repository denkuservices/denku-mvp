"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPasswordAction } from "../_actions/setPassword";

interface SetPasswordFormProps {
  email: string;
  orgName: string; // Not used anymore (collected in onboarding), kept for type compatibility
  fullName: string; // Not used anymore (collected in onboarding), kept for type compatibility
}

export function SetPasswordForm({ email, orgName, fullName }: SetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sessionExpired, setSessionExpired] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      // orgName and fullName are empty strings (will be collected in onboarding)
      const result = await setPasswordAction(password, confirmPassword, orgName, fullName);
      if (!result.ok) {
        // Check if error indicates session expired
        const errorMsg = result.error?.toLowerCase() || "";
        if (errorMsg.includes("session expired") || errorMsg.includes("verify again")) {
          setSessionExpired(true);
          setError(result.error);
        } else {
          setError(result.error);
        }
        return;
      }

      // Password set successfully - navigate to onboarding
      // Client-side navigation ensures cookies are committed before navigation
      router.replace("/onboarding");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-[var(--s-ink-soft)]">
        Create a password for your account.
      </p>

      <div>
        <label className="block text-sm font-medium text-[var(--s-ink)] mb-1.5">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          disabled={isPending}
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full rounded-xl border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:border-[var(--s-accent)] disabled:opacity-60 transition-colors"
          placeholder="Minimum 8 characters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--s-ink)] mb-1.5">Confirm password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError(null);
          }}
          disabled={isPending}
          minLength={8}
          required
          autoComplete="new-password"
          className="w-full rounded-xl border border-[var(--s-border)] bg-[var(--s-panel)] px-4 py-3 text-[var(--s-ink)] placeholder:text-[var(--s-ink-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:border-[var(--s-accent)] disabled:opacity-60 transition-colors"
          placeholder="Confirm your password"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
          {sessionExpired && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  // Reset to OTP step - user needs to verify again
                  window.location.href = `/verify-email?email=${encodeURIComponent(email)}`;
                }}
                className="text-sm text-red-800 underline hover:text-red-900 transition-colors"
              >
                Resend code
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-[var(--s-cta-bg)] text-white py-3.5 font-medium hover:bg-[var(--s-accent)] active:bg-[var(--s-accent-deep)] focus:outline-none focus:ring-2 focus:ring-[var(--s-accent-ring)] focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Setting password..." : "Set password and continue"}
      </button>
    </form>
  );
}


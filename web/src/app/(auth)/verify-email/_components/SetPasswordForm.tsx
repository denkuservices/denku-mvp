"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPasswordAction } from "../_actions/setPassword";
import { saveSignupPhoneAction } from "../_actions/saveSignupPhone";

interface SetPasswordFormProps {
  email: string;
  orgName: string;
  fullName: string;
}

export function SetPasswordForm({ email, orgName, fullName }: SetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      const result = await setPasswordAction(password, confirmPassword, orgName, fullName);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // After password is set successfully, save phone from sessionStorage
      if (typeof window !== "undefined") {
        const lowerEmail = email.toLowerCase();
        const storedPhone = sessionStorage.getItem(`signup:phone:${lowerEmail}`);
        const phone = storedPhone ? storedPhone.trim() : null;

        // Save phone (non-blocking, don't fail if this errors)
        await saveSignupPhoneAction(phone || null).catch(() => {
          // Silently fail - phone is optional
        });

        // Clear sessionStorage after successful save
        sessionStorage.removeItem(`signup:phone:${lowerEmail}`);
      }

      // Redirect to dashboard (setPasswordAction handles email confirmation check)
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm text-slate-600">
        Create a password for your account.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-900 mb-1.5">Password</label>
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
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-slate-300 disabled:opacity-60 transition-colors"
          placeholder="Minimum 8 characters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-900 mb-1.5">Confirm password</label>
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
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-slate-300 disabled:opacity-60 transition-colors"
          placeholder="Confirm your password"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl bg-indigo-600 text-white py-3.5 font-medium hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Setting password..." : "Set password and continue"}
      </button>
    </form>
  );
}


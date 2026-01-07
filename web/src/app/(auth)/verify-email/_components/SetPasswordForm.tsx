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
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Create a password for your account.
      </p>

      <div>
        <label className="text-sm font-medium">Password</label>
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
          className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
          placeholder="Minimum 8 characters"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Confirm password</label>
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
          className="mt-1 w-full rounded-md border px-3 py-2 disabled:opacity-60"
          placeholder="Confirm your password"
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-black text-white py-2 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isPending ? "Setting password..." : "Set password and continue"}
      </button>
    </form>
  );
}


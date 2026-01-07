"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword, signOutAllDevices } from "../../../_actions/security";

interface AccountSecurityClientProps {
  email: string;
  isPasswordManagedByProvider: boolean;
  providerLabel: string;
}

export function AccountSecurityClient({
  email,
  isPasswordManagedByProvider,
  providerLabel,
}: AccountSecurityClientProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isSignOutPending, startSignOutTransition] = useTransition();

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    // Client-side validation: check length first
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }

    // Client-side validation: check match
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    // All client-side checks passed, call server action
    startPasswordTransition(async () => {
      const result = await changePassword({ password, confirmPassword });

      if (result.ok) {
        setPasswordSuccess(true);
        setPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        setPasswordError(result.error || "Failed to update password");
      }
    });
  };

  const handleSignOutAll = () => {
    if (!confirm("This will sign you out on all devices. Continue?")) {
      return;
    }

    startSignOutTransition(async () => {
      const result = await signOutAllDevices();
      if (result.ok) {
        router.push("/login");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Email Section */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-base font-semibold text-foreground">Email</p>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
        <p className="mt-2 text-xs text-muted-foreground">Managed by your authentication provider.</p>
      </div>

      {/* Password Section */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-base font-semibold text-foreground">Password</p>
        
        {isPasswordManagedByProvider ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Password is managed by your identity provider.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Update your account password.
            </p>

            <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-1">
                  New password
                </label>
                <input
                  type="password"
                  id="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                  disabled={isPasswordPending}
                  minLength={8}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-1">
                  Confirm new password
                </label>
                <input
                  type="password"
                  id="confirm-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                  disabled={isPasswordPending}
                  minLength={8}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              {passwordError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-800">{passwordError}</p>
                </div>
              )}

              {passwordSuccess && (
                <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
                  <p className="text-sm text-green-800">Your password has been updated.</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isPasswordPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isPasswordPending ? "Updating..." : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Sessions Section */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
        <p className="text-base font-semibold text-foreground">Active sessions</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This will sign you out on all devices.
        </p>
        <button
          type="button"
          onClick={handleSignOutAll}
          disabled={isSignOutPending}
          className="mt-4 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSignOutPending ? "Signing out..." : "Sign out all devices"}
        </button>
      </div>
    </div>
  );
}


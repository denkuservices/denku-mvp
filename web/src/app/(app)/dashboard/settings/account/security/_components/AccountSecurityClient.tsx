"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FieldLabel,
  INPUT_WITH_ICON_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { changePassword, signOutAllDevices } from "../../../_actions/security";

interface AccountSecurityClientProps {
  email: string;
  isPasswordManagedByProvider: boolean;
  providerLabel: string;
}

/**
 * Security — sign-in method, password, sessions.
 *
 * Three grey boxes with three bold words on top; the one that logs you out of every device
 * everywhere looked exactly like the one that displays your email address, and it confirmed
 * through `window.confirm` — a browser chrome dialog in the middle of a designed surface. Each
 * concern now has its glyph and its tone, signing out everywhere is a `danger` control behind the
 * same dialog the rest of Settings uses, and the password field has a reveal toggle, which is the
 * single most useful affordance a password form can have and costs nothing.
 */
export function AccountSecurityClient({
  email,
  isPasswordManagedByProvider,
  providerLabel,
}: AccountSecurityClientProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isSignOutPending, startSignOutTransition] = useTransition();
  const [signOutOpen, setSignOutOpen] = useState(false);

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
    startSignOutTransition(async () => {
      const result = await signOutAllDevices();
      if (result.ok) {
        router.push("/login");
      } else {
        setSignOutOpen(false);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* How you sign in */}
      <Panel>
        <PanelHeader
          icon={Fingerprint}
          tone="info"
          title="Sign-in method"
          description={
            isPasswordManagedByProvider
              ? `${providerLabel} signs you in. Your password is managed there, not here.`
              : "You sign in with an email address and a password set on Denku."
          }
          action={
            <StatusPill tone="info" icon={Mail}>
              {email}
            </StatusPill>
          }
        />
      </Panel>

      {/* Password */}
      <Panel>
        <PanelHeader
          icon={KeyRound}
          title="Password"
          description={
            isPasswordManagedByProvider
              ? `Managed by ${providerLabel}.`
              : "Use at least 8 characters. Changing it does not sign you out elsewhere."
          }
        />

        {isPasswordManagedByProvider ? (
          <div className="mt-4">
            <Notice tone="info" icon={ShieldCheck}>
              There is no Denku password on this account — {providerLabel} handles sign-in, so
              change it there.
            </Notice>
          </div>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel htmlFor="new-password" icon={KeyRound} required>
                  New password
                </FieldLabel>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type={reveal ? "text" : "password"}
                    id="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    disabled={isPasswordPending}
                    minLength={8}
                    className={`${INPUT_WITH_ICON_CLASS} !pr-11`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition hover:text-navy-700 dark:hover:text-white"
                  >
                    {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="confirm-password" icon={KeyRound} required>
                  Confirm new password
                </FieldLabel>
                <div className="relative">
                  <KeyRound
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type={reveal ? "text" : "password"}
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    disabled={isPasswordPending}
                    minLength={8}
                    className={INPUT_WITH_ICON_CLASS}
                    required
                  />
                </div>
              </div>
            </div>

            {passwordError ? (
              <Notice tone="critical" icon={AlertCircle}>
                {passwordError}
              </Notice>
            ) : null}

            {passwordSuccess ? (
              <Notice tone="ok" icon={CheckCircle2}>
                Your password has been updated.
              </Notice>
            ) : null}

            <div className="flex justify-end">
              <SettingsButton type="submit" variant="primary" disabled={isPasswordPending}>
                {isPasswordPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                {isPasswordPending ? "Updating…" : "Update password"}
              </SettingsButton>
            </div>
          </form>
        )}
      </Panel>

      {/* Sessions */}
      <Panel tone="critical">
        <PanelHeader
          icon={MonitorSmartphone}
          tone="critical"
          title="Active sessions"
          description="Sign out of Denku on every device, including this one. Use it if you've lost a device."
          action={
            <SettingsButton
              type="button"
              variant="danger"
              onClick={() => setSignOutOpen(true)}
              disabled={isSignOutPending}
            >
              <LogOut />
              Sign out everywhere
            </SettingsButton>
          }
        />
      </Panel>

      <Dialog open={signOutOpen} onOpenChange={(o) => !isSignOutPending && setSignOutOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5 text-red-500" />
              Sign out everywhere?
            </DialogTitle>
            <DialogDescription>
              Every signed-in device is signed out, this one included. You&apos;ll be returned to the
              login page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => setSignOutOpen(false)}
              disabled={isSignOutPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="danger"
              onClick={handleSignOutAll}
              disabled={isSignOutPending}
            >
              {isSignOutPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              {isSignOutPending ? "Signing out…" : "Sign out everywhere"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

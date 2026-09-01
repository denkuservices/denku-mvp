"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  FieldLabel,
  INPUT_WITH_ICON_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { changePassword } from "../../../_actions/security";
import type { SessionRow } from "../../../_actions/security";
import { MfaCard, type Factor } from "./MfaCard";
import { SessionsCard } from "./SessionsCard";

interface AccountSecurityClientProps {
  email: string;
  isPasswordManagedByProvider: boolean;
  providerLabel: string;
  /** Resolved on the server: `auth.sessions` is not reachable from the browser. */
  sessions: SessionRow[];
  /** Resolved on the server so the card never paints "two-step is off" to someone who has it on. */
  mfaFactors: Factor[];
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
 *
 * The audit added the two things that make this a security page rather than a password page:
 * changing the password now requires the CURRENT one (a borrowed session could previously take the
 * account), and the single "sign out everywhere" button grew into a real session list plus
 * two-step verification — see `SessionsCard` and `MfaCard`.
 */
export function AccountSecurityClient({
  email,
  isPasswordManagedByProvider,
  providerLabel,
  sessions,
  mfaFactors,
}: AccountSecurityClientProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isPasswordPending, startPasswordTransition] = useTransition();

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }

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
      const result = await changePassword({ currentPassword, password, confirmPassword });

      if (result.ok) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        setPasswordError(result.error || "Failed to update password");
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
              : "Enter your current password, then a new one of at least 8 characters. Changing it does not sign you out elsewhere."
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
            {/*
              The current password is asked for first because it is the point of the form: without
              it, anyone reaching a signed-in tab could set a new one and lock the account holder
              out of their own business. `autoComplete="current-password"` keeps the password
              manager filling the right box.
            */}
            <div className="space-y-2 md:max-w-[calc(50%-0.5rem)]">
              <FieldLabel htmlFor="current-password" icon={Lock} required>
                Current password
              </FieldLabel>
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="password"
                  id="current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  disabled={isPasswordPending}
                  className={INPUT_WITH_ICON_CLASS}
                  required
                />
              </div>
            </div>

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
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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

      {/* Two-step verification, then the devices this account is signed in on. */}
      <MfaCard initialFactors={mfaFactors} />

      <SessionsCard sessions={sessions} />

    </div>
  );
}

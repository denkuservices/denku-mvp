"use client";

import Image from "next/image";
import { useCallback, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
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
  INPUT_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Two-step verification, over Supabase Auth's own TOTP factors.
 *
 * The account page had a password field and a "sign out everywhere" button and nothing else — so
 * a leaked or reused password was, on its own, the whole of an attacker's work. TOTP is the
 * cheapest real second factor: no phone number to buy, no SMS to intercept, and it works with
 * whatever authenticator app the customer already has.
 *
 * Two details worth keeping:
 *
 *   * **Enrolment is not finished until a code verifies.** Supabase creates the factor in an
 *     `unverified` state; if the person closes the dialog after scanning but before entering a
 *     code, that half-made factor is deleted rather than left behind — otherwise the next
 *     enrolment attempt collides with a factor nobody can use.
 *   * **Turning it off asks for a code too.** Unenrolling without one would mean a borrowed
 *     session could simply remove the protection it just ran into, which is the same hole
 *     re-authentication on the password form exists to close.
 *
 * This is per-ACCOUNT, not per-workspace: enforcing MFA across a whole org is a policy that needs
 * a place to live and an escape hatch for the person it locks out, and it is deliberately not
 * claimed here.
 *
 * The CURRENT state arrives as a prop, resolved on the server. Fetching it on mount instead would
 * paint "two-step is off" for a frame to someone who has it on — which is the one thing a security
 * card must never say by accident.
 */

export type Factor = { id: string; friendlyName: string | null; status: string };

export function MfaCard({ initialFactors }: { initialFactors: Factor[] }) {
  const supabase = createSupabaseBrowserClient();

  const [factors, setFactors] = useState<Factor[]>(initialFactors);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [removeTarget, setRemoveTarget] = useState<Factor | null>(null);
  const [removeCode, setRemoveCode] = useState("");

  /** Re-read the factor list after a change. Only ever called from an event handler. */
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setLoadError("We couldn't check your two-step status.");
      return;
    }
    setLoadError(null);
    setFactors(
      (data?.all ?? []).map((f) => ({
        id: f.id,
        friendlyName: f.friendly_name ?? null,
        status: f.status,
      }))
    );
  }, [supabase]);

  const verified = factors.filter((f) => f.status === "verified");
  const isOn = verified.length > 0;

  /** Abandon a factor that was created but never verified, so the next attempt starts clean. */
  const discardPending = useCallback(async () => {
    if (!pendingFactorId) return;
    await supabase.auth.mfa.unenroll({ factorId: pendingFactorId }).catch(() => {});
    setPendingFactorId(null);
  }, [pendingFactorId, supabase]);

  const beginEnroll = () => {
    setDialogError(null);
    setCode("");
    setEnrollOpen(true);
    startTransition(async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error || !data) {
        setDialogError(error?.message || "We couldn't start setup. Try again.");
        return;
      }
      setPendingFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    });
  };

  const closeEnroll = () => {
    if (isPending) return;
    void discardPending();
    setEnrollOpen(false);
    setQr(null);
    setSecret(null);
    setCode("");
    setDialogError(null);
  };

  const confirmEnroll = () => {
    if (!pendingFactorId) return;
    setDialogError(null);
    startTransition(async () => {
      const challenge = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
      if (challenge.error || !challenge.data) {
        setDialogError("We couldn't verify that code. Try again.");
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verify.error) {
        setDialogError("That code isn't right. Check your app and try the current code.");
        return;
      }
      setPendingFactorId(null);
      setEnrollOpen(false);
      setQr(null);
      setSecret(null);
      setCode("");
      await refresh();
    });
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    const target = removeTarget;
    setDialogError(null);
    startTransition(async () => {
      // Prove it is really them before removing the thing that proves it is really them.
      const challenge = await supabase.auth.mfa.challenge({ factorId: target.id });
      if (challenge.error || !challenge.data) {
        setDialogError("We couldn't verify that code. Try again.");
        return;
      }
      const verify = await supabase.auth.mfa.verify({
        factorId: target.id,
        challengeId: challenge.data.id,
        code: removeCode.trim(),
      });
      if (verify.error) {
        setDialogError("That code isn't right.");
        return;
      }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: target.id });
      if (error) {
        setDialogError("We couldn't turn two-step off. Try again.");
        return;
      }
      setRemoveTarget(null);
      setRemoveCode("");
      await refresh();
    });
  };

  return (
    <Panel>
      <PanelHeader
        icon={isOn ? ShieldCheck : ShieldAlert}
        tone={isOn ? "ok" : "warn"}
        title="Two-step verification"
        description={
          isOn
            ? "You are asked for a code from your authenticator app when you sign in."
            : "Add a code from an authenticator app on top of your password. It is the single biggest thing you can do to protect this workspace."
        }
        action={
          isOn ? (
            <StatusPill tone="ok" icon={ShieldCheck} dot>
              On
            </StatusPill>
          ) : (
            <SettingsButton type="button" variant="primary" onClick={beginEnroll}>
              <Smartphone />
              Turn on
            </SettingsButton>
          )
        }
      />

      {loadError ? (
        <div className="mt-4">
          <Notice tone="warn" icon={AlertCircle}>
            {loadError}
          </Notice>
        </div>
      ) : null}

      {isOn ? (
        <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/10 dark:border-white/10">
          {verified.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-4 py-3">
              <Smartphone aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-navy-700 dark:text-white">
                {f.friendlyName || "Authenticator app"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRemoveCode("");
                  setDialogError(null);
                  setRemoveTarget(f);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Turn off
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Enrol */}
      <Dialog open={enrollOpen} onOpenChange={(o) => (o ? setEnrollOpen(true) : closeEnroll())}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-brand-500" />
              Set up two-step verification
            </DialogTitle>
            <DialogDescription>
              Scan this with your authenticator app, then enter the six-digit code it shows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {qr ? (
              <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10">
                {/* Supabase returns the QR as an inline SVG data URI. */}
                <Image src={qr} alt="Two-step verification QR code" width={180} height={180} unoptimized />
              </div>
            ) : (
              <div className="flex h-[212px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            )}

            {secret ? (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500">Can&apos;t scan? Enter this key instead:</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-navy-700 dark:bg-white/10 dark:text-white">
                    {secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(secret)}
                    aria-label="Copy the setup key"
                    className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-navy-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <FieldLabel htmlFor="mfa-code" icon={ShieldCheck} required>
                Six-digit code
              </FieldLabel>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${INPUT_CLASS} text-center font-mono text-lg tracking-[0.4em]`}
                placeholder="000000"
              />
            </div>

            {dialogError ? (
              <Notice tone="critical" icon={AlertCircle}>
                {dialogError}
              </Notice>
            ) : null}
          </div>

          <DialogFooter>
            <SettingsButton type="button" variant="ghost" onClick={closeEnroll} disabled={isPending}>
              Cancel
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="primary"
              onClick={confirmEnroll}
              disabled={isPending || code.length !== 6 || !pendingFactorId}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {isPending ? "Checking…" : "Turn on"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog
        open={Boolean(removeTarget)}
        onOpenChange={(o) => !o && !isPending && setRemoveTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              Turn off two-step verification?
            </DialogTitle>
            <DialogDescription>
              Your password becomes the only thing protecting this account. Enter a current code to
              confirm it is you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={removeCode}
              aria-label="Six-digit code"
              onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, ""))}
              className={`${INPUT_CLASS} text-center font-mono text-lg tracking-[0.4em]`}
              placeholder="000000"
            />
            {dialogError ? (
              <Notice tone="critical" icon={AlertCircle}>
                {dialogError}
              </Notice>
            ) : null}
          </div>

          <DialogFooter>
            <SettingsButton
              type="button"
              variant="ghost"
              onClick={() => setRemoveTarget(null)}
              disabled={isPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton
              type="button"
              variant="danger"
              onClick={confirmRemove}
              disabled={isPending || removeCode.length !== 6}
            >
              {isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isPending ? "Turning off…" : "Turn off"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Globe,
  Loader2,
  LogOut,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Tablet,
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
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { RelativeTime } from "@/components/time/ClientTime";
import { revokeSession, signOutAllDevices } from "../../../_actions/security";
import type { SessionRow } from "../../../_actions/security";

/**
 * Where this account is signed in.
 *
 * "Sign out everywhere" was the only session control, which is the right button to have and the
 * wrong one to be the only button: someone who left a session open on a shared laptop had to sign
 * themselves out of their phone, their desktop and the tab they were reading this in — and had no
 * way to know the stale session existed in the first place.
 *
 * The current session is labelled, because without that "Sign out" on a row is a coin flip about
 * whether you are about to log yourself out. Signing out of the current one falls through to the
 * login page rather than leaving a dead tab behind.
 */

function deviceOf(userAgent: string | null): { icon: typeof Monitor; label: string } {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return { icon: Globe, label: "Unknown device" };
  if (/ipad|tablet/.test(ua)) return { icon: Tablet, label: "Tablet" };
  if (/iphone|android|mobile/.test(ua)) return { icon: Smartphone, label: "Phone" };
  return { icon: Monitor, label: "Computer" };
}

/**
 * A readable name for a user-agent string. Deliberately coarse: "Chrome on macOS" is what a person
 * needs to recognise their own laptop, and a full UA string is noise they cannot act on.
 */
function describe(userAgent: string | null): string {
  const ua = userAgent || "";
  if (!ua) return "Unknown browser";

  const browser =
    /edg\//i.test(ua) ? "Edge"
    : /opr\//i.test(ua) ? "Opera"
    : /chrome\//i.test(ua) ? "Chrome"
    : /safari\//i.test(ua) ? "Safari"
    : /firefox\//i.test(ua) ? "Firefox"
    : "Browser";

  const os =
    /windows/i.test(ua) ? "Windows"
    : /mac os x|macintosh/i.test(ua) ? "macOS"
    : /android/i.test(ua) ? "Android"
    : /iphone|ipad|ios/i.test(ua) ? "iOS"
    : /linux/i.test(ua) ? "Linux"
    : null;

  return os ? `${browser} on ${os}` : browser;
}

export function SessionsCard({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signOutAllOpen, setSignOutAllOpen] = useState(false);

  const revoke = (session: SessionRow) => {
    setError(null);
    setBusyId(session.id);
    startTransition(async () => {
      const result = await revokeSession(session.id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? "Could not sign that device out");
        return;
      }
      // Ending your own session leaves the page authenticated only until the next request.
      // Send them to login rather than letting them discover it by clicking something.
      if (session.current) router.push("/login");
      else router.refresh();
    });
  };

  const signOutEverywhere = () => {
    startTransition(async () => {
      const result = await signOutAllDevices();
      if (result.ok) router.push("/login");
      else setSignOutAllOpen(false);
    });
  };

  return (
    <Panel>
      <PanelHeader
        icon={MonitorSmartphone}
        title="Where you're signed in"
        description={
          sessions.length === 0
            ? "Sign out of Denku on every device, including this one. Use it if you've lost a device."
            : `${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}. Sign out of any you don't recognise.`
        }
        action={
          <SettingsButton
            type="button"
            variant="danger"
            onClick={() => setSignOutAllOpen(true)}
            disabled={isPending}
          >
            <LogOut />
            Sign out everywhere
          </SettingsButton>
        }
      />

      {error ? (
        <div className="mt-4">
          <Notice tone="critical" icon={AlertCircle}>
            {error}
          </Notice>
        </div>
      ) : null}

      {sessions.length > 0 ? (
        <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-white/10 dark:border-white/10">
          {sessions.map((s) => {
            const { icon: Icon, label } = deviceOf(s.userAgent);
            const busy = busyId === s.id && isPending;
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-navy-700 dark:text-white">
                    {describe(s.userAgent)}
                    {s.current ? <StatusPill tone="ok">This device</StatusPill> : null}
                    {s.aal === "aal2" ? <StatusPill tone="info">Two-step</StatusPill> : null}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {label}
                    {s.ip ? ` · ${s.ip}` : ""} · last used{" "}
                    <RelativeTime iso={s.refreshedAt ?? s.createdAt} />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(s)}
                  disabled={busy || isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  {s.current ? "Sign out here" : "Sign out"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-gray-500">
          We can&apos;t list individual sessions for this account right now. Signing out everywhere
          still works.
        </p>
      )}

      <Dialog open={signOutAllOpen} onOpenChange={(o) => !isPending && setSignOutAllOpen(o)}>
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
              onClick={() => setSignOutAllOpen(false)}
              disabled={isPending}
            >
              Cancel
            </SettingsButton>
            <SettingsButton type="button" variant="danger" onClick={signOutEverywhere} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <LogOut />}
              {isPending ? "Signing out…" : "Sign out everywhere"}
            </SettingsButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

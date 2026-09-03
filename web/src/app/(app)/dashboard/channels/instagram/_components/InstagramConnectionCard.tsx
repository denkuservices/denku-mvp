"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Instagram, Radio, Unplug } from "lucide-react";
import type { PublicConnection } from "@/lib/instagram/connections";
import { disconnectInstagramAction, subscribeInstagramForCurrentOrgAction } from "../_actions";
import { Badge } from "@/components/ui-horizon/badge";
import Card from "@/components/ui-horizon/card";
import { HorizonAnchorButton, HorizonButton } from "@/components/ui-horizon/button";
import { Notice } from "@/components/ui-horizon/notice";

const ERROR_COPY: Record<string, string> = {
  not_configured: "Instagram isn't configured on this environment yet. Contact your administrator.",
  no_org: "No organization found for your account.",
  denied: "The Instagram authorization was cancelled.",
  missing_params: "Instagram returned an incomplete response. Please try again.",
  org_mismatch: "That connection didn't match your session. Please try again.",
  persist_failed: "We couldn't save the connection. Please try again.",
  exchange_failed: "Instagram rejected the connection. Please try again.",
};

function friendlyError(code: string | null): string | null {
  if (!code) return null;
  if (ERROR_COPY[code]) return ERROR_COPY[code];
  if (code.startsWith("bad_state")) return "Your connection link expired. Please try again.";
  return "Something went wrong connecting Instagram. Please try again.";
}

export function InstagramConnectionCard({
  connection,
  canManage,
  connected,
  errorCode,
}: {
  connection: PublicConnection | null;
  canManage: boolean;
  connected: boolean;
  errorCode: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(friendlyError(errorCode));

  // TEMP operator backfill (Sprint 1.5) — remove after webhook path verified.
  const [subPending, startSubTransition] = useTransition();
  const [subMsg, setSubMsg] = useState<string | null>(null);
  const handleSubscribe = () => {
    setSubMsg(null);
    startSubTransition(async () => {
      const res = await subscribeInstagramForCurrentOrgAction();
      setSubMsg(
        res.ok
          ? `Subscribed to webhooks: ${(res.fields ?? []).join(", ") || "(no fields)"}.`
          : `Subscribe failed: ${res.error ?? "unknown error"}.`
      );
      if (res.ok) router.refresh();
    });
  };

  const isConnected = connection?.status === "connected";

  const handleDisconnect = () => {
    setError(null);
    startTransition(async () => {
      const res = await disconnectInstagramAction();
      if (!res.ok) setError(res.error || "Failed to disconnect.");
      else router.refresh();
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300">
            <Instagram aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-base font-semibold text-navy-700 dark:text-white">Instagram Business</p>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-400">
              Receive messages and comments from your connected business account.
            </p>
          </div>
        </div>
        <Badge variant={isConnected ? "success" : "default"} dot>
          {isConnected ? "Connected" : connection?.status === "revoked" ? "Disconnected" : "Not connected"}
        </Badge>
      </div>

      {connected && (
        <Notice tone="success" className="mt-4">Instagram connected successfully.</Notice>
      )}
      {error && (
        <Notice tone="danger" className="mt-4">{error}</Notice>
      )}

      {isConnected && connection && (
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Account" value={connection.username ? `@${connection.username}` : connection.ig_user_id} />
          <Field label="Type" value={connection.account_type ?? "—"} />
          <Field
            label="Token expires"
            value={connection.token_expires_at ? new Date(connection.token_expires_at).toLocaleDateString() : "—"}
          />
          <Field label="Connected" value={new Date(connection.connected_at).toLocaleDateString()} />
        </dl>
      )}

      <div className="mt-6 flex items-center gap-3">
        {!isConnected && canManage ? (
          <HorizonAnchorButton
            href="/api/instagram/oauth/start"
            variant="primary"
          >
            <Instagram />
            Connect Instagram
          </HorizonAnchorButton>
        ) : !isConnected ? (
          <HorizonButton disabled variant="primary">
            <Instagram />
            Connect Instagram
          </HorizonButton>
        ) : (
          <HorizonButton
            onClick={handleDisconnect}
            disabled={!canManage || isPending}
            variant="danger"
          >
            <Unplug />
            {isPending ? "Disconnecting…" : "Disconnect"}
          </HorizonButton>
        )}
        {!canManage && <span className="text-xs text-gray-500">Only owners and admins can manage this.</span>}
      </div>

      {/* TEMP operator action (Sprint 1.5) — subscribe this account's webhooks. Remove after verification. */}
      {isConnected && canManage && (
        <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"><Radio aria-hidden="true" className="h-3.5 w-3.5" /> Operator · temporary</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            Register this account for Instagram webhooks (message/comment delivery).
          </p>
          <div className="mt-3 flex items-center gap-3">
            <HorizonButton
              onClick={handleSubscribe}
              disabled={subPending}
              size="sm"
            >
              {subPending ? "Subscribing…" : "Subscribe Connected Instagram Accounts"}
            </HorizonButton>
            {subMsg && <span className="text-sm text-gray-700 dark:text-gray-300">{subMsg}</span>}
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-white/10 dark:bg-white/5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-navy-700 dark:text-white">{value}</dd>
    </div>
  );
}

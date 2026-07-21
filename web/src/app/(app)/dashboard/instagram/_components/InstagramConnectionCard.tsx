"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PublicConnection } from "@/lib/instagram/connections";
import { disconnectInstagramAction } from "../_actions";

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
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-zinc-900">Instagram Business</p>
          <p className="mt-1 text-sm text-zinc-600">
            Connect your Instagram Business account so Denku can receive its messages and comments.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
            isConnected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-zinc-200 bg-zinc-50 text-zinc-600"
          }`}
        >
          {isConnected ? "Connected" : connection?.status === "revoked" ? "Disconnected" : "Not connected"}
        </span>
      </div>

      {connected && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Instagram connected successfully.
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
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
        {!isConnected ? (
          <a
            href="/api/instagram/oauth/start"
            aria-disabled={!canManage}
            className={`inline-flex items-center rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 ${
              canManage ? "" : "pointer-events-none opacity-50"
            }`}
          >
            Connect Instagram
          </a>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={!canManage || isPending}
            className="inline-flex items-center rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        {!canManage && <span className="text-xs text-zinc-500">Only owners and admins can manage this.</span>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{value}</dd>
    </div>
  );
}

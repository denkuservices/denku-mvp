"use client";

import React, { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";
import {
  FieldLabel,
  INPUT_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "../../../_platform/settings/ui";

export interface CommerceConnectionView {
  id: string;
  storeBaseUrl: string;
  storeLabel: string | null;
  clientId: string;
  status: "pending" | "connected" | "revoked" | "error";
  lastError: string | null;
  lastVerifiedAt: string | null;
  grantedScope: string | null;
}

/**
 * Connecting an IdeaSoft store, in the order the customer actually does it.
 *
 * The flow has one hard edge and the whole card is arranged around it: **the redirect URL must be
 * registered in the customer's own IdeaSoft panel BEFORE they can create the API app**, and a
 * mismatch there is the single most common way this fails — with an error message from IdeaSoft
 * that does not say which URL it expected. So the redirect URL is step one, it is copyable, and it
 * is shown again in the error state.
 *
 * The three credentials are asked for on one screen because that is how they are copied: the
 * customer has their panel open in another tab with all three visible at once, and a wizard would
 * make them alt-tab three times.
 */
export function IdeaSoftCard({
  connection,
  redirectUri,
  credentialPath,
  docsUrl,
  canManage,
  banner,
}: {
  connection: CommerceConnectionView | null;
  redirectUri: string;
  credentialPath: string;
  docsUrl: string;
  canManage: boolean;
  /** Result of a return trip from the store's approval page, read off the query string. */
  banner: { tone: "ok" | "warn" | "critical"; title: string; detail?: string } | null;
}) {
  const [storeUrl, setStoreUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy — select the address and copy it by hand.");
    }
  };

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/ideasoft/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeUrl, clientId, clientSecret }),
      });
      const data = (await res.json()) as { ok: boolean; authorizeUrl?: string; message?: string };
      if (!data.ok || !data.authorizeUrl) {
        setError(data.message ?? "Could not start the connection.");
        setBusy(false);
        return;
      }
      // The customer now approves on their OWN store. We leave; IdeaSoft sends them back to
      // /api/integrations/ideasoft/callback, which lands them here again with a result.
      window.location.href = data.authorizeUrl;
    } catch {
      setError("Could not reach Denku. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function test() {
    if (!connection) return;
    setTestResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/ideasoft/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      setTestResult({
        ok: data.ok,
        message: data.message ?? (data.ok ? "The store answered." : "The store could not be reached."),
      });
    } catch {
      setTestResult({ ok: false, message: "Could not reach Denku." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!connection) return;
    if (!window.confirm("Disconnect this store? Your AI will stop being able to answer about products.")) return;
    setBusy(true);
    try {
      await fetch("/api/integrations/ideasoft/status", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      startTransition(() => window.location.reload());
    } catch {
      setError("Could not disconnect. Try again.");
      setBusy(false);
    }
  }

  const statusPill = () => {
    if (!connection) return <StatusPill tone="neutral">Not connected</StatusPill>;
    switch (connection.status) {
      case "connected":
        return (
          <StatusPill tone="ok" dot>
            Connected
          </StatusPill>
        );
      case "pending":
        return <StatusPill tone="warn">Waiting for approval</StatusPill>;
      case "revoked":
        return <StatusPill tone="critical">Needs re-authorizing</StatusPill>;
      default:
        return <StatusPill tone="critical">Error</StatusPill>;
    }
  };

  return (
    <Panel>
      <PanelHeader
        icon={Store}
        title="IdeaSoft"
        description="Let your AI answer about your products: live prices, stock counts, and every colour and size."
        action={statusPill()}
      />

      {banner ? (
        <div className="mt-5">
          <Notice
            tone={banner.tone}
            icon={banner.tone === "ok" ? CheckCircle2 : AlertTriangle}
            title={banner.title}
          >
            {banner.detail}
          </Notice>
        </div>
      ) : null}

      {connection && connection.status === "connected" ? (
        <div className="mt-5 space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Store</dt>
              <dd className="mt-1 truncate text-sm text-navy-700 dark:text-white">
                {connection.storeLabel ?? connection.storeBaseUrl}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Last read</dt>
              <dd className="mt-1 text-sm text-navy-700 dark:text-white">
                {connection.lastVerifiedAt
                  ? new Date(connection.lastVerifiedAt).toLocaleString()
                  : "Not read yet"}
              </dd>
            </div>
          </dl>

          <Notice tone="info" icon={Plug} title="What your AI can do now">
            On every channel — phone, web chat, Telegram — it can look a product up by name or code and
            tell the customer the price, how many are in stock, and which colours and sizes are
            available. The numbers come from your store as it is right now, never from a copy.
          </Notice>

          {testResult ? (
            <Notice
              tone={testResult.ok ? "ok" : "critical"}
              icon={testResult.ok ? CheckCircle2 : AlertTriangle}
            >
              {testResult.message}
            </Notice>
          ) : null}

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <SettingsButton onClick={test} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Test the connection
              </SettingsButton>
              <SettingsButton variant="danger" onClick={disconnect} disabled={busy || pending}>
                <Trash2 className="h-4 w-4" />
                Disconnect
              </SettingsButton>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {connection && connection.status !== "pending" && connection.lastError ? (
            <Notice tone="critical" icon={AlertTriangle} title="This store is not answering">
              {connection.lastError}
            </Notice>
          ) : null}

          {/* Step one, and the reason this card is laid out the way it is. */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              1 · Add this address in your IdeaSoft panel
            </p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Go to <span className="font-medium">{credentialPath}</span>, create a new API app, and paste
              this as the <span className="font-medium">Redirect URL</span>. It has to match exactly.
              IdeaSoft will then show you a Client ID and a Client Secret.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-navy-700 dark:border-white/10 dark:bg-navy-900 dark:text-white">
                {redirectUri}
              </code>
              <SettingsButton type="button" onClick={copyRedirect}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </SettingsButton>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Give the app <span className="font-medium">read</span> access to Katalog. Denku never writes
              to your store.{" "}
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                IdeaSoft API docs <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <form onSubmit={connect} className="space-y-4">
            <p className="text-sm font-semibold text-navy-700 dark:text-white">
              2 · Paste what IdeaSoft gave you
            </p>

            <div className="space-y-1.5">
              <FieldLabel icon={Store} htmlFor="ideasoft-store" required>
                Store address
              </FieldLabel>
              <input
                id="ideasoft-store"
                className={INPUT_CLASS}
                placeholder="magazaniz.myideasoft.com"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                autoComplete="off"
                required
                disabled={!canManage || busy}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Your own domain works too, if that is where the panel lives.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel icon={KeyRound} htmlFor="ideasoft-client-id" required>
                  Client ID
                </FieldLabel>
                <input
                  id="ideasoft-client-id"
                  className={INPUT_CLASS}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                  required
                  disabled={!canManage || busy}
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel icon={KeyRound} htmlFor="ideasoft-client-secret" required>
                  Client Secret
                </FieldLabel>
                <input
                  id="ideasoft-client-secret"
                  type="password"
                  className={INPUT_CLASS}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  autoComplete="off"
                  required
                  disabled={!canManage || busy}
                />
              </div>
            </div>

            {error ? (
              <Notice tone="critical" icon={AlertTriangle}>
                {error}
              </Notice>
            ) : null}

            <div className="flex items-center gap-3">
              <SettingsButton
                type="submit"
                variant="primary"
                disabled={!canManage || busy || !storeUrl || !clientId || !clientSecret}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                Connect and approve
              </SettingsButton>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You will be sent to your own store to approve, then back here.
              </p>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}

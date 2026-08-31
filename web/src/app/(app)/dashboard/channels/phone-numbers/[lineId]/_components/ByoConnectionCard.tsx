"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";

/**
 * The carrier settings for a connected (BYO) line, kept somewhere the customer can find again.
 *
 * The connect wizard shows these once. A customer who closed it — or who is setting the trunk up
 * days later, or who handed the job to their telecom vendor — has nowhere else to read them, and
 * "open a support ticket to see your own configuration" is not a product. So this card re-derives
 * them from the trunk on every load.
 *
 * It renders NOTHING for a Denku-provisioned line, and nothing while it is still loading, so it
 * can be dropped onto the detail page unconditionally.
 */

interface Instructions {
  carrier: string;
  gatewayHost: string | null;
  authUsername: string | null;
  forwardHost: string;
  forwardPort: number;
  perCredentialUri: string;
  calledPrefix: string | null;
  callerPrefix: string | null;
  vapiInboundIps: string[];
}

interface StatusResponse {
  ok: boolean;
  provider?: string;
  verificationStatus?: string;
  verifiedAt?: string | null;
  instructions?: Instructions | null;
}

function CopyRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2.5 last:border-0 dark:border-white/5">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="truncate font-mono text-sm text-navy-700 dark:text-white">{value}</p>
        {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded-lg border border-gray-300 p-2 text-gray-600 transition-colors hover:bg-gray-50 dark:border-white/20 dark:text-white dark:hover:bg-navy-600"
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function ByoConnectionCard({ lineId }: { lineId: string }) {
  const [data, setData] = useState<StatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/phone-lines/${lineId}/status`, { cache: "no-store" });
        const json = (await res.json()) as StatusResponse;
        if (!cancelled) setData(json);
      } catch {
        // Leave the card hidden rather than showing an error box for a secondary panel.
      }
    };

    load();
    // While the line is unverified the customer is often mid-setup in another tab, so keep
    // checking. Once verified there is nothing left to watch.
    const timer = setInterval(() => {
      if (data?.verificationStatus === "verified") return;
      load();
    }, 10000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lineId, data?.verificationStatus]);

  if (!data?.ok || data.provider !== "byo_sip") return null;

  const verified = data.verificationStatus === "verified";
  const ins = data.instructions ?? null;

  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-navy-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">Your provider connection</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            This number stays with {ins?.carrier ?? "your provider"}. Denku answers it.
          </p>
        </div>
        {verified ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
            <Check className="h-3.5 w-3.5" /> Confirmed
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for first call
          </span>
        )}
      </div>

      {!verified ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          The line is live and will answer. We confirm it the first time a real call arrives —
          call the number yourself once the settings below are saved at your provider.
        </p>
      ) : null}

      {ins ? (
        <div className="mt-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Set these at {ins.carrier}
          </p>
          <CopyRow label="SIP Trunk address" value={ins.forwardHost} />
          <CopyRow label="Port" value={String(ins.forwardPort)} />
          {ins.calledPrefix ? (
            <CopyRow
              label="Aranan Prefix (called number)"
              value={ins.calledPrefix}
              hint="The number must arrive in full international format, or the call reaches us and matches no line."
            />
          ) : null}
          {ins.callerPrefix ? <CopyRow label="Arayan Prefix (caller number)" value={ins.callerPrefix} /> : null}
          <CopyRow label="Full SIP address (if your provider asks for one)" value={ins.perCredentialUri} />
          <CopyRow label="IP allowlist (if required)" value={ins.vapiInboundIps.join(", ")} />
          {ins.gatewayHost ? <CopyRow label="Your provider's SIP address" value={ins.gatewayHost} /> : null}
          {ins.authUsername ? <CopyRow label="SIP username" value={ins.authUsername} /> : null}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Your SIP password is not shown because Denku never stored it — it went straight to the
            telephony provider when you connected this number.
          </p>
        </div>
      ) : null}
    </div>
  );
}

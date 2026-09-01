"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { safeErrorMessage } from "@/lib/errors/safeErrorMessage";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, Copy, Loader2 } from "lucide-react";

/**
 * Connect a number the customer already owns, over their own carrier's SIP trunk.
 *
 * Deliberately a separate component from the purchase wizard rather than a fourth branch inside
 * it: the two share a button and nothing else. Purchase spends money and picks a number for you;
 * this one spends nothing, takes a number you already have, and then asks you to go and change a
 * setting at your carrier. Keeping them apart is what lets the purchase path stay untouched.
 *
 * Three screens, and the middle one is the product:
 *   1. details — carrier, number, SIP credentials
 *   2. instructions — what to paste into the carrier's panel. This screen decides whether the
 *      feature works in the field, so it shows exact values with copy buttons, not prose.
 *   3. waiting — polls until the first real call proves the tenant controls the number.
 */

type Screen = "details" | "instructions" | "done";

interface Instructions {
  forwardHost: string;
  forwardPort: number;
  perCredentialUri: string;
  calledPrefix?: string;
  callerPrefix?: string;
  vapiInboundIps: string[];
}

interface Props {
  onCancel: () => void;
  onConnected?: () => void;
}

/**
 * Same rule as `isIpv4` in `lib/vapi/sipTrunk.ts`, restated because that module is `server-only`
 * and this form runs in the browser. Kept strict and in step with it deliberately: Vapi accepts
 * nothing but a bare IPv4 on an inbound gateway.
 */
function isIpv4(value: string): boolean {
  const parts = (value ?? "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** Carriers with a verified recipe. Anything else falls back to manual entry. */
const CARRIERS = [
  {
    key: "netgsm",
    label: "Netgsm (Türkiye)",
    // The ADDRESS of sip.netgsm.com.tr, not the name: Vapi rejects a hostname on an inbound
    // gateway. Kept in step with KNOWN_SIP_CARRIERS in lib/vapi/sipTrunk.ts.
    gatewayHost: "185.88.7.189",
    gatewayPort: 5060,
    panelPath: "Ses Hizmeti → Ayarlar → SIP Bilgileri",
    numberHint: "0850 123 45 67",
  },
  {
    key: "other",
    label: "Another SIP provider",
    gatewayHost: "",
    gatewayPort: 5060,
    panelPath: "your provider's SIP trunk settings",
    numberHint: "+90 850 123 45 67",
  },
] as const;

function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="truncate font-mono text-sm text-navy-700 dark:text-white">{value}</p>
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
      {hint ? <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white";
const secondaryBtn =
  "rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/20 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600";
const primaryBtn =
  "linear flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-400 dark:hover:bg-brand-300";

export function ConnectOwnNumberFlow({ onCancel, onConnected }: Props) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("details");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [carrierKey, setCarrierKey] = useState<string>("netgsm");
  const [number, setNumber] = useState("");
  const [gatewayHost, setGatewayHost] = useState("sip.netgsm.com.tr");
  const [gatewayPort, setGatewayPort] = useState("5060");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [displayName, setDisplayName] = useState("Support Line");

  const [lineId, setLineId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [verified, setVerified] = useState(false);

  const carrier = CARRIERS.find((c) => c.key === carrierKey) ?? CARRIERS[1];

  useEffect(() => {
    const c = CARRIERS.find((x) => x.key === carrierKey);
    if (c) {
      setGatewayHost(c.gatewayHost);
      setGatewayPort(String(c.gatewayPort));
    }
  }, [carrierKey]);

  // Poll for the first inbound call. The line is live the whole time — "pending" means
  // unproven, not switched off — so this screen is informational, never blocking.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (screen !== "instructions" || !lineId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/phone-lines/${lineId}/status`, { cache: "no-store" });
        const data = await res.json();
        if (data?.ok && data.verificationStatus === "verified") {
          setVerified(true);
          setScreen("done");
          router.refresh();
        }
      } catch {
        // A failed poll is not worth showing: the next one is 5 seconds away.
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [screen, lineId, router]);

  const submit = async () => {
    setError(null);
    if (!number.trim()) return setError("Enter the phone number you want to connect.");
    if (!gatewayHost.trim()) return setError("Enter your provider's SIP server IP.");
    if (!isIpv4(gatewayHost)) {
      return setError(
        "Your provider's SIP server must be an IP address like 185.88.7.189, not a name. Ask them for it if the panel only shows a hostname."
      );
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/phone-lines/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: number.trim(),
          displayName: displayName.trim() || undefined,
          lineType: "support",
          carrier: {
            providerKey: carrierKey,
            name: carrier.label,
            gatewayHost: gatewayHost.trim(),
            gatewayPort: Number(gatewayPort) || 5060,
            authUsername: authUsername.trim() || undefined,
            authPassword: authPassword || undefined,
          },
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(safeErrorMessage(data?.error, "Could not connect this number. Please try again."));
        setSubmitting(false);
        return;
      }

      setLineId(data.lineId ?? null);
      setInstructions(data.instructions ?? null);
      // The password only ever existed in this form. Drop it the moment it is no longer needed.
      setAuthPassword("");
      setScreen("instructions");
      setSubmitting(false);
      if (onConnected) onConnected();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSubmitting(false);
    }
  };

  if (screen === "details") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Connect your own number</DialogTitle>
          <DialogDescription>
            Keep the number your customers already know. You keep paying your carrier for the line;
            Denku answers it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
              Your phone provider
            </label>
            <select value={carrierKey} onChange={(e) => setCarrierKey(e.target.value)} className={inputClass}>
              {CARRIERS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
              Phone number
            </label>
            <input
              type="tel"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={carrier.numberHint}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                SIP server IP
              </label>
              <input
                type="text"
                value={gatewayHost}
                onChange={(e) => setGatewayHost(e.target.value)}
                placeholder="185.88.7.189"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">Port</label>
              <input
                type="text"
                inputMode="numeric"
                value={gatewayPort}
                onChange={(e) => setGatewayPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                SIP username
              </label>
              <input
                type="text"
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
                SIP password
              </label>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Find these in {carrier.panelPath}. Your password is sent straight to the telephony
            provider and is never stored by Denku.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-white">
              Line name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
          <button onClick={onCancel} disabled={submitting} className={secondaryBtn}>
            Cancel
          </button>
          <button onClick={submit} disabled={submitting} className={primaryBtn}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Connecting…" : "Connect number"}
          </button>
        </div>
      </>
    );
  }

  if (screen === "instructions" && instructions) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>One step left — at your provider</DialogTitle>
          <DialogDescription>
            Denku is ready for this number. Now tell {carrier.label} to send its calls here, in{" "}
            {carrier.panelPath}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-4">
          <Field label="SIP Trunk address" value={instructions.forwardHost} />
          <Field label="Port" value={String(instructions.forwardPort)} />
          {instructions.calledPrefix ? (
            <Field
              label="Aranan Prefix (called number)"
              value={instructions.calledPrefix}
              hint="This one matters most: the number must arrive in full international format, or the call reaches us and matches nothing."
            />
          ) : null}
          {instructions.callerPrefix ? (
            <Field label="Arayan Prefix (caller number)" value={instructions.callerPrefix} />
          ) : null}
          <Field
            label="If your provider asks for a full SIP address instead"
            value={instructions.perCredentialUri}
          />
          <Field
            label="If your provider needs an IP allowlist"
            value={instructions.vapiInboundIps.join(", ")}
          />

          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand-500" />
            <div>
              <p className="text-sm font-medium text-navy-700 dark:text-white">
                Waiting for your first call
              </p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                Once the settings are saved, call the number yourself. That call is how we confirm
                the line is really yours — the AI will answer it. You can close this window; the
                line is already live.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
          <button onClick={onCancel} className={secondaryBtn}>
            Close
          </button>
          {lineId ? (
            <button
              onClick={() => {
                onCancel();
                router.push(`/dashboard/channels/phone-numbers/${lineId}`);
              }}
              className={primaryBtn}
            >
              View line
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Your number is connected</DialogTitle>
        <DialogDescription>
          {verified
            ? "We received a call on it, so the line is confirmed and answering."
            : "The line is live."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
        <button onClick={onCancel} className={secondaryBtn}>
          Close
        </button>
        {lineId ? (
          <button
            onClick={() => {
              onCancel();
              router.push(`/dashboard/channels/phone-numbers/${lineId}`);
            }}
            className={primaryBtn}
          >
            View line
          </button>
        ) : null}
      </div>
    </>
  );
}

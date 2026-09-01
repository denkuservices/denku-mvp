import "server-only";
import { vapiFetch } from "@/lib/vapi/server";

/**
 * BYO SIP trunk — the Vapi side of connecting a number the customer already owns.
 *
 * Shape follows `assistantConfig.ts`: the payload builders are PURE and unit-tested, and the
 * network calls are thin wrappers around them. Nothing here touches the database.
 *
 * Two objects make a BYO line work:
 *   1. a `byo-sip-trunk` **credential** — who the carrier is and how we authenticate to them;
 *   2. a `byo-phone-number` — the customer's number, bound to that credential and to an assistant.
 *
 * **Direction matters and is easy to get backwards.** For inbound, the carrier sends the call to
 * Vapi; Vapi does not dial the carrier. The `gateways[].ip` entry is therefore the carrier's SIP
 * host (what Vapi will accept calls from), and the carrier's own panel must be pointed at
 * `sip.vapi.ai`.
 *
 * Verified against Netgsm's own Vapi integration guide (2026-08-31), which is the first carrier
 * Denku supports: gateway `sip.netgsm.com.tr`, register-style username/password, carrier
 * forwards to `sip.vapi.ai:5060` with a called-number prefix of `+90` so the number arrives in
 * E.164 — it must match `number` exactly or Vapi cannot map the call to this line.
 */

export interface SipTrunkInput {
  /** Human name for the trunk, e.g. "Netgsm". */
  name: string;
  /** Carrier SIP host or IP — Netgsm: `sip.netgsm.com.tr`. */
  gatewayHost: string;
  /** Usually 5060; omitted when the carrier uses the default. */
  gatewayPort?: number | null;
  /** Carrier SIP username. Not a secret — it identifies the trunk. */
  authUsername?: string | null;
  /** Carrier SIP password. Passed through to Vapi and never persisted by Denku. */
  authPassword?: string | null;
}

export interface ByoPhoneNumberInput {
  /** E.164, including a non-US country code — e.g. `+908501234567`. */
  number: string;
  name: string;
  credentialId: string;
  assistantId: string;
}

/** Carriers Denku has actually verified. Used for defaults and support copy, never as a gate. */
export const KNOWN_SIP_CARRIERS = {
  netgsm: {
    label: "Netgsm",
    /**
     * Netgsm's SIP host as an ADDRESS, not a name — `185.88.7.189`, the A record of
     * `sip.netgsm.com.tr`.
     *
     * Vapi refuses a hostname here whenever the gateway accepts inbound calls:
     * `gateways.0.ip must be a numeric IPv4 address when inboundEnabled is true or omitted`
     * (observed on the first real connect attempt, 2026-09-01). Since every Denku BYO trunk is
     * inbound, the name is never a legal value — so the preset carries the address and keeps the
     * hostname beside it for humans.
     *
     * The cost is real: this IP is pinned, and if Netgsm renumbers, inbound stops with no error
     * on our side. It is also a HYPOTHESIS until proven — Vapi matches the SOURCE address of the
     * carrier's INVITE, and a carrier may sign from a different host than the one it publishes.
     * If the first call never reaches Vapi, ask Netgsm for their egress range and widen this.
     */
    gatewayHost: "185.88.7.189",
    /** Human-facing name for the same host. Never sent to Vapi — see `gatewayHost`. */
    gatewayHostname: "sip.netgsm.com.tr",
    gatewayPort: 5060,
    /** What the customer must enter in their carrier panel as the destination. */
    forwardTo: "sip.vapi.ai",
    /** Netgsm panel: "Aranan Prefix" — makes the called number arrive as +90XXXXXXXXXX. */
    calledPrefix: "+90",
    /**
     * Netgsm panel: "Arayan Prefix".
     *
     * `+90`, NOT the `0` Netgsm's own guide suggests. The caller's number is what becomes a
     * contact, and the Vapi webhook's `normalizePhone` does not turn a leading `0` into a country
     * code — it stores what it is given. A `0` prefix therefore files the caller as `0532…`,
     * which matches no other channel's identity for the same person and cannot be dialled back.
     * Corrected 2026-09-01 while connecting the first real Netgsm line.
     */
    callerPrefix: "+90",
  },
} as const;

export type KnownCarrierKey = keyof typeof KNOWN_SIP_CARRIERS;

/**
 * Is this a bare IPv4 address? Deliberately strict — Vapi accepts nothing else on an inbound
 * gateway, so anything a human might reasonably type (a hostname, a SIP URI, a v6 address) is a
 * refusal, not a value to coerce.
 */
export function isIpv4(value: string): boolean {
  const parts = (value ?? "").trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/**
 * Build the `POST /credential` body. Pure.
 *
 * `inboundEnabled: true` is the whole point — without it Vapi will not accept calls the carrier
 * sends. `outboundAuthenticationPlan` is omitted entirely when no username is supplied, because
 * an empty auth block is not the same as no auth block and carriers reject the difference.
 */
export function buildTrunkCredentialPayload(input: SipTrunkInput): Record<string, unknown> {
  const host = input.gatewayHost.trim();
  if (!isIpv4(host)) {
    // Caught here rather than at Vapi, whose 400 for this ("gateways.0.ip must be a numeric
    // IPv4 address when inboundEnabled is true or omitted") reaches the customer as a generic
    // "could not connect" once `safeErrorMessage` has scrubbed it.
    throw new Error(
      `SIP gateway must be a numeric IPv4 address for an inbound trunk, got "${host}"`
    );
  }

  const gateway: Record<string, unknown> = {
    ip: host,
    inboundEnabled: true,
  };
  if (input.gatewayPort) gateway.port = input.gatewayPort;

  const payload: Record<string, unknown> = {
    provider: "byo-sip-trunk",
    name: input.name.trim().slice(0, 40),
    gateways: [gateway],
    // Turkish and European numbers are dialled with the leading +; without this the carrier
    // sees a number it cannot route.
    outboundLeadingPlusEnabled: true,
  };

  const user = (input.authUsername ?? "").trim();
  const pass = input.authPassword ?? "";
  if (user && pass) {
    payload.outboundAuthenticationPlan = { authUsername: user, authPassword: pass };
  }

  return payload;
}

/**
 * Build the `POST /phone-number` body. Pure.
 *
 * `numberE164CheckEnabled: false` is deliberate and load-bearing: Vapi's E.164 check is tuned
 * for the numbers it sells (US), and a Turkish 0850 number is rejected by it. Turning it off is
 * how a non-US number is accepted at all — so the caller MUST hand us a properly formatted E.164
 * string, since nothing downstream will catch a malformed one.
 *
 * `assistantId` is set at create time on purpose (same reason as the purchase path): binding in
 * a second PATCH leaves a window where the number answers with no assistant.
 */
export function buildByoPhoneNumberPayload(input: ByoPhoneNumberInput): Record<string, unknown> {
  return {
    provider: "byo-phone-number",
    name: input.name.trim().slice(0, 40),
    number: input.number.trim(),
    numberE164CheckEnabled: false,
    credentialId: input.credentialId,
    assistantId: input.assistantId,
  };
}

/**
 * Normalize a user-typed number to E.164, or return null when it cannot be trusted.
 *
 * Deliberately conservative: this is the value Vapi matches inbound calls against, and a wrong
 * one fails silently (the call simply never maps to a line). Accepts `+90…`, `0090…`, `090…` and
 * bare national Turkish numbers; refuses anything else rather than guessing a country.
 */
export function toE164(raw: string, defaultCountryCode = "90"): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    digits = "+" + digits.slice(1).replace(/\D/g, "");
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }

  digits = digits.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = defaultCountryCode + digits.slice(1);
  else if (!digits.startsWith(defaultCountryCode)) digits = defaultCountryCode + digits;

  const e164 = "+" + digits;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/**
 * The address the customer must point their carrier at.
 *
 * Netgsm's guide says plain `sip.vapi.ai`; Vapi's own docs describe a per-credential host
 * (`{number}@{credentialId}.sip.vapi.ai`). Both are produced here so the instructions screen can
 * show the carrier-specific one first and the generic one as a fallback — a customer whose
 * carrier rejects one needs the other, not a support ticket.
 */
export function sipDestinationForLine(number: string, credentialId: string) {
  return {
    host: "sip.vapi.ai",
    perCredentialUri: `${number}@${credentialId}.sip.vapi.ai`,
    port: 5060,
  };
}

export interface VapiCredential {
  id: string;
}
export interface VapiByoPhoneNumber {
  id: string;
  number?: string;
  status?: string;
}

export async function createSipTrunkCredential(input: SipTrunkInput): Promise<VapiCredential> {
  return vapiFetch<VapiCredential>("/credential", {
    method: "POST",
    body: JSON.stringify(buildTrunkCredentialPayload(input)),
  });
}

export async function createByoPhoneNumber(input: ByoPhoneNumberInput): Promise<VapiByoPhoneNumber> {
  return vapiFetch<VapiByoPhoneNumber>("/phone-number", {
    method: "POST",
    body: JSON.stringify(buildByoPhoneNumberPayload(input)),
  });
}

/** Best-effort rollback helpers — callers log failures and carry on. */
export async function deleteCredential(credentialId: string): Promise<void> {
  await vapiFetch(`/credential/${credentialId}`, { method: "DELETE" });
}

export async function deleteByoPhoneNumber(phoneNumberId: string): Promise<void> {
  await vapiFetch(`/phone-number/${phoneNumberId}`, { method: "DELETE" });
}

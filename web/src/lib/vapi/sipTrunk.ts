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
  /**
   * Every OTHER address the same carrier may send an INVITE from.
   *
   * Vapi matches the SOURCE address of the carrier's INVITE against this list, so the list is not
   * "where we send" — it is "who we believe". A carrier that egresses from a second host is
   * refused there, and refused invisibly: no call record on our side at all, and a busy tone for
   * the caller. Netgsm published exactly this trap (see `KNOWN_SIP_CARRIERS`).
   */
  additionalGatewayHosts?: readonly string[] | null;
  /**
   * Whole ranges the carrier may egress from, in CIDR — expanded to individual addresses before
   * they reach Vapi, which refuses a mask.
   *
   * Only for a range the carrier has told us to trust in writing. A guessed range is a widened
   * trust boundary bought with nothing.
   */
  gatewayCidrs?: readonly string[] | null;
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
    /**
     * Netgsm's OTHER SIP host — and the reason the first live line went silent.
     *
     * Proven 2026-09-03, hours after the line was verified: calls started hitting a busy tone
     * with **no call record at Vapi at all**. Vapi's SBCs answered OPTIONS, the number, credential
     * and assistant were untouched, and the workspace was active — so nothing on our side had
     * refused anything. What had changed was which Netgsm host the call came out of. Netgsm
     * publishes at least two live SIP hosts in its own DNS: `sip`/`sip3`/`sip5` all resolve to
     * `185.88.7.189`, while **`sip2.netgsm.com.tr` is `185.88.7.196`**, and both answer SIP
     * OPTIONS. Netgsm owns the whole `185.88.7.0/24` (RIPE: NETGSM-4).
     *
     * A one-address allowlist therefore works until Netgsm routes a call out of the other host,
     * and then fails in the worst possible way: silently, intermittently, and with the caller
     * hearing a busy signal that looks exactly like the customer's own line being broken.
     *
     * Two hosts was a floor, and it was not enough — the busy tone came back. **Netgsm answered
     * the question on 2026-09-03, in writing:** STH subscribers normally egress from
     * `sip.netgsm.com.tr` only, `sip2` "should not" send us packets but may, *"and the rest of
     * our IP addresses are the ones running on our switchboards"* — closing with
     * **"185.88.7.0/24 bloğuna izin verebilirsiniz"** (you may allow the /24 block). So the
     * missing calls were arriving from their PBX hosts, which are neither published in DNS nor
     * enumerable by us.
     *
     * Hence the range rather than a list. See `gatewayCidrs` below for why this is expanded into
     * individual addresses, and what it costs.
     */
    additionalGatewayHosts: ["185.88.7.196"],
    /**
     * Netgsm's whole allocation (RIPE: NETGSM-4), on Netgsm's own written instruction.
     *
     * **The trust boundary moves here, deliberately.** It used to be "one Netgsm host"; it is now
     * "Netgsm's network". That is a real widening, and it is the correct trade: the alternative
     * is not a tighter allowlist, it is a customer's published business number returning a busy
     * signal to real callers some of the time, for a reason nothing on our side can observe. What
     * an entry buys an attacker is also small — the ability to offer us a call for a number we
     * already answer for anyone who dials it — and they would have to source-spoof from inside
     * Netgsm's block to get it.
     *
     * ⚠ This is expanded to 254 individual gateways because **Vapi rejects CIDR outright**:
     * `gateways.0.ip must be a numeric IPv4 address when inboundEnabled is true or omitted`
     * (tested against the live API, 2026-09-03, along with the ceiling — 254 gateways on one
     * credential is accepted). Do not "simplify" this back to a mask.
     */
    gatewayCidrs: ["185.88.7.0/24"],
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
 * Turn `a.b.c.d/NN` into the individual addresses Vapi will accept.
 *
 * Vapi rejects a mask outright — `gateways.0.ip must be a numeric IPv4 address when
 * inboundEnabled is true or omitted` — so a carrier's egress RANGE can only be expressed one
 * address at a time. Tested against the live API on 2026-09-03: a `/24` in `ip` is a 400, and 254
 * gateways on a single credential is accepted.
 *
 * Deliberately capped at `/24`. That is 254 hosts, which is already at the tested ceiling; a
 * `/16` would be 65,534 gateways, and a carrier asking for one is a conversation to have with a
 * person, not a number to silently expand. Network and broadcast addresses are skipped — nothing
 * sends SIP from either, and they would spend two of the 254 slots.
 */
export function expandIpv4Cidr(cidr: string): string[] {
  const [base, maskRaw] = (cidr ?? "").trim().split("/");
  const mask = Number(maskRaw);
  if (!isIpv4(base) || !Number.isInteger(mask)) {
    throw new Error(`Not a CIDR range: "${cidr}"`);
  }
  if (mask < 24 || mask > 32) {
    throw new Error(`CIDR range must be between /24 and /32, got "${cidr}"`);
  }

  const octets = base.split(".").map(Number);
  const size = 2 ** (32 - mask);
  const start = octets[3] & (256 - size);

  const out: string[] = [];
  for (let i = 0; i < size; i++) {
    const last = start + i;
    // Skip network/broadcast only where they exist — a /32 is a single host and has neither.
    if (size > 1 && (last === start || last === start + size - 1)) continue;
    out.push(`${octets[0]}.${octets[1]}.${octets[2]}.${last}`);
  }
  return out;
}

/**
 * Build the `POST /credential` body. Pure.
 *
 * `inboundEnabled: true` is the whole point — without it Vapi will not accept calls the carrier
 * sends. `outboundAuthenticationPlan` is omitted entirely when no username is supplied, because
 * an empty auth block is not the same as no auth block and carriers reject the difference.
 */
export function buildTrunkCredentialPayload(input: SipTrunkInput): Record<string, unknown> {
  // Deduplicated, order preserved: the primary host stays gateway 0, which is the one Vapi names
  // in its validation errors and the one a human recognises in the panel. Ranges come last for
  // the same reason — the named hosts stay readable at the top of the list even once a /24 has
  // been expanded behind them.
  const hosts = Array.from(
    new Set(
      [
        input.gatewayHost,
        ...(input.additionalGatewayHosts ?? []),
        ...(input.gatewayCidrs ?? []).flatMap((c) => expandIpv4Cidr(c)),
      ]
        .map((h) => (h ?? "").trim())
        .filter(Boolean)
    )
  );

  for (const host of hosts) {
    if (!isIpv4(host)) {
      // Caught here rather than at Vapi, whose 400 for this ("gateways.0.ip must be a numeric
      // IPv4 address when inboundEnabled is true or omitted") reaches the customer as a generic
      // "could not connect" once `safeErrorMessage` has scrubbed it.
      throw new Error(
        `SIP gateway must be a numeric IPv4 address for an inbound trunk, got "${host}"`
      );
    }
  }

  const gateways = hosts.map((ip) => {
    const gateway: Record<string, unknown> = { ip, inboundEnabled: true };
    if (input.gatewayPort) gateway.port = input.gatewayPort;
    return gateway;
  });

  const payload: Record<string, unknown> = {
    provider: "byo-sip-trunk",
    name: input.name.trim().slice(0, 40),
    gateways,
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

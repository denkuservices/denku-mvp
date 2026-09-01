import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { makeChain, type ChainCall } from "./helpers/supabaseMock";

/**
 * BYO SIP numbers — the payloads a carrier actually has to accept, and the proof-of-control rule.
 *
 * These are written against Netgsm's published Vapi integration (the first carrier Denku
 * supports): gateway `sip.netgsm.com.tr`, register-style username/password, and a called-number
 * prefix of `+90` so the number arrives in E.164. Two details are load-bearing and silent when
 * wrong — `inboundEnabled` (without it Vapi refuses the carrier's calls) and
 * `numberE164CheckEnabled: false` (without it Vapi rejects a Turkish number outright). Neither
 * failure is visible in the product: the line just never rings.
 */

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/vapi/server", () => ({ vapiFetch: vi.fn() }));

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildTrunkCredentialPayload,
  buildByoPhoneNumberPayload,
  sipDestinationForLine,
  toE164,
  isIpv4,
  KNOWN_SIP_CARRIERS,
} from "@/lib/vapi/sipTrunk";
import { markPhoneLineVerified } from "@/lib/vapi/phoneLineVerification";
import { byoNumbersEnabled } from "@/lib/platform/flags";
import { resolveWorkspaceLineDefaults } from "@/lib/phone-lines/connectByo";

const from = supabaseAdmin.from as unknown as Mock;

beforeEach(() => {
  from.mockReset();
});

describe("trunk credential payload", () => {
  it("enables inbound on the gateway — the carrier calls us, not the other way round", () => {
    const p = buildTrunkCredentialPayload({
      name: "Netgsm",
      gatewayHost: KNOWN_SIP_CARRIERS.netgsm.gatewayHost,
      gatewayPort: 5060,
      authUsername: "u",
      authPassword: "p",
    });

    expect(p.provider).toBe("byo-sip-trunk");
    const gateways = p.gateways as Array<Record<string, unknown>>;
    expect(gateways[0].ip).toBe("185.88.7.189");
    expect(gateways[0].inboundEnabled).toBe(true);
    expect(gateways[0].port).toBe(5060);
    // Turkish numbers are dialled with the leading +.
    expect(p.outboundLeadingPlusEnabled).toBe(true);
  });

  it("carries the carrier's username and password when both are given", () => {
    const p = buildTrunkCredentialPayload({
      name: "Netgsm",
      gatewayHost: "185.88.7.189",
      authUsername: "user1",
      authPassword: "secret",
    });
    expect(p.outboundAuthenticationPlan).toEqual({ authUsername: "user1", authPassword: "secret" });
  });

  it("refuses a hostname, because Vapi will not take one on an inbound gateway", () => {
    // The real 400, on the first live connect attempt (2026-09-01):
    // "gateways.0.ip must be a numeric IPv4 address when inboundEnabled is true or omitted".
    // Vapi's message is scrubbed by `safeErrorMessage` on the way back to the customer, so a
    // hostname that reaches Vapi becomes an unexplained "could not connect". Refuse it here.
    expect(() =>
      buildTrunkCredentialPayload({ name: "Netgsm", gatewayHost: "sip.netgsm.com.tr" })
    ).toThrow(/numeric IPv4/);
  });

  it("knows an address from a name", () => {
    expect(isIpv4("185.88.7.189")).toBe(true);
    expect(isIpv4("1.2.3.4")).toBe(true);
    expect(isIpv4("sip.netgsm.com.tr")).toBe(false);
    expect(isIpv4("185.88.7")).toBe(false);
    expect(isIpv4("185.88.7.999")).toBe(false);
    expect(isIpv4("")).toBe(false);
  });

  it("omits the auth block entirely when there are no credentials, rather than sending an empty one", () => {
    const p = buildTrunkCredentialPayload({ name: "IP trunk", gatewayHost: "1.2.3.4" });
    expect(p).not.toHaveProperty("outboundAuthenticationPlan");
    expect(p).not.toHaveProperty("port");
  });
});

describe("byo phone number payload", () => {
  it("turns off the E.164 check — otherwise a +90 number is rejected outright", () => {
    const p = buildByoPhoneNumberPayload({
      number: "+908501234567",
      name: "Destek",
      credentialId: "cred_1",
      assistantId: "asst_1",
    });
    expect(p.provider).toBe("byo-phone-number");
    expect(p.numberE164CheckEnabled).toBe(false);
    expect(p.number).toBe("+908501234567");
    // Bound at create time: a second PATCH would leave a window where the line answers with no AI.
    expect(p.assistantId).toBe("asst_1");
    expect(p.credentialId).toBe("cred_1");
  });

  it("never sends a top-level tools field (Vapi 400s on it)", () => {
    const p = buildByoPhoneNumberPayload({
      number: "+908501234567",
      name: "x",
      credentialId: "c",
      assistantId: "a",
    });
    expect(p).not.toHaveProperty("tools");
  });
});

describe("number normalization — a wrong number fails silently, so refuse it early", () => {
  it.each([
    ["+908501234567", "+908501234567"],
    ["0850 123 45 67", "+908501234567"],
    ["00908501234567", "+908501234567"],
    ["850 123 45 67", "+908501234567"],
  ])("%s -> %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it("refuses junk instead of guessing", () => {
    expect(toE164("")).toBeNull();
    expect(toE164("abc")).toBeNull();
    expect(toE164("+1")).toBeNull();
  });

  it("keeps a non-Turkish E.164 number as given", () => {
    expect(toE164("+13213928560")).toBe("+13213928560");
  });
});

describe("carrier instructions", () => {
  it("gives both the plain host and the per-credential URI", () => {
    const d = sipDestinationForLine("+908501234567", "cred_abc");
    expect(d.host).toBe("sip.vapi.ai");
    expect(d.perCredentialUri).toBe("+908501234567@cred_abc.sip.vapi.ai");
    expect(d.port).toBe(5060);
  });
});

describe("proof of control", () => {
  it("marks a pending line verified, scoped to org + number + pending only", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ data: [{ id: "line-1" }], error: null }, log));

    await markPhoneLineVerified("org-1", "vapi-num-1");

    const eqs = log.filter(([m]) => m === "eq").map(([, a]) => [a[0], a[1]]);
    expect(eqs).toEqual([
      ["org_id", "org-1"],
      ["vapi_phone_number_id", "vapi-num-1"],
      // The pending filter is what makes repeated webhook deliveries idempotent.
      ["verification_status", "pending"],
    ]);
    const update = log.find(([m]) => m === "update");
    expect((update![1][0] as Record<string, unknown>).verification_status).toBe("verified");
  });

  it("does nothing without an org or a number", async () => {
    await markPhoneLineVerified("", "num");
    await markPhoneLineVerified("org", "");
    expect(from).not.toHaveBeenCalled();
  });

  it("never throws when the BYO migration has not been applied yet", async () => {
    from.mockReturnValue(
      makeChain({ data: null, error: { message: 'column "verification_status" does not exist' } })
    );
    await expect(markPhoneLineVerified("org-1", "num-1")).resolves.toBeUndefined();
  });
});

describe("feature flag", () => {
  it("is off unless explicitly enabled", () => {
    expect(byoNumbersEnabled({})).toBe(false);
    expect(byoNumbersEnabled({ BYO_NUMBERS_ENABLED: "false" })).toBe(false);
    expect(byoNumbersEnabled({ BYO_NUMBERS_ENABLED: "TRUE" })).toBe(true);
  });
});

describe("a connected line is born speaking what the business speaks", () => {
  it("inherits language, extra languages, timezone and voice from the workspace's main employee", async () => {
    from
      .mockReturnValueOnce(makeChain({ data: { main_agent_id: "agent-main", default_timezone: "Europe/Madrid" } }))
      .mockReturnValueOnce(
        makeChain({
          data: {
            language: "es",
            additional_languages: ["en"],
            timezone: "Europe/Madrid",
            voice: "nova",
          },
        })
      );

    const d = await resolveWorkspaceLineDefaults("org-1");
    expect(d).toEqual({
      language: "es",
      additionalLanguages: ["en"],
      timezone: "Europe/Madrid",
      voice: "nova",
    });
  });

  it("falls back to the workspace default when there is no main employee yet", async () => {
    from.mockReturnValueOnce(
      makeChain({ data: { main_agent_id: null, default_language: "es", default_timezone: "Europe/Madrid" } })
    );

    const d = await resolveWorkspaceLineDefaults("org-1");
    expect(d.language).toBe("es");
    expect(d.timezone).toBe("Europe/Madrid");
  });

  it("refuses to label a line with a language Denku cannot speak (R-135 again, one row at a time)", async () => {
    // French has no transcriber and no voice behind it, so it must never reach an agent row.
    from.mockReturnValueOnce(
      makeChain({ data: { main_agent_id: null, onboarding_language: "fr", default_timezone: null } })
    );

    const d = await resolveWorkspaceLineDefaults("org-1");
    // English, not "fr": storing fr would create a line that claims a language it answers in
    // English. The registry is the boundary, and it is honest on purpose.
    expect(d.language).toBe("en");
  });

  it("drops extra languages with no ear and no mouth, and never repeats the primary", async () => {
    from
      .mockReturnValueOnce(makeChain({ data: { main_agent_id: "agent-main", default_timezone: null } }))
      .mockReturnValueOnce(
        makeChain({
          data: {
            language: "Spanish",
            additional_languages: ["en", "fr", "es"],
            timezone: "Europe/Madrid",
            voice: "nova",
          },
        })
      );

    const d = await resolveWorkspaceLineDefaults("org-1");
    // "Spanish" is the NAME form the Setup editor persists; it resolves to the code.
    expect(d.language).toBe("es");
    expect(d.additionalLanguages).toEqual(["en"]);
  });

  it("never throws — a lookup failure just means English defaults, not a failed connect", async () => {
    from.mockImplementation(() => {
      throw new Error("db down");
    });
    const d = await resolveWorkspaceLineDefaults("org-1");
    expect(d.language).toBe("en");
    expect(d.timezone).toBe("America/New_York");
  });
});

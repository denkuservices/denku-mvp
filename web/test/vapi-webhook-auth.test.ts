import { describe, it, expect } from "vitest";
import {
  getWebhookAuthMode,
  checkVapiWebhookAuth,
  safeEqual,
  VAPI_SECRET_HEADER,
} from "@/lib/vapi/webhookAuth";

const SECRET = "s3cr3t-value";
// A header getter backed by a plain map (case-insensitive on the one key we use).
const headers = (map: Record<string, string>) => (name: string) => map[name] ?? null;

describe("getWebhookAuthMode", () => {
  it("defaults to off when no secret and no explicit mode", () => {
    expect(getWebhookAuthMode({})).toBe("off");
  });
  it("defaults to log (observe-only) when a secret exists but no explicit mode", () => {
    expect(getWebhookAuthMode({ VAPI_WEBHOOK_SECRET: SECRET })).toBe("log");
  });
  it("honors explicit modes case-insensitively", () => {
    expect(getWebhookAuthMode({ VAPI_WEBHOOK_AUTH_MODE: "ENFORCE" })).toBe("enforce");
    expect(getWebhookAuthMode({ VAPI_WEBHOOK_AUTH_MODE: "log" })).toBe("log");
    expect(getWebhookAuthMode({ VAPI_WEBHOOK_AUTH_MODE: "off" })).toBe("off");
  });
  it("falls back to the default for an unrecognized value", () => {
    expect(getWebhookAuthMode({ VAPI_WEBHOOK_AUTH_MODE: "banana", VAPI_WEBHOOK_SECRET: SECRET })).toBe("log");
  });
});

describe("safeEqual", () => {
  it("is true for equal strings, false otherwise (incl. length mismatch)", () => {
    expect(safeEqual(SECRET, SECRET)).toBe(true);
    expect(safeEqual(SECRET, "different-value!")).toBe(false);
    expect(safeEqual(SECRET, SECRET + "x")).toBe(false); // length mismatch must not throw
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("checkVapiWebhookAuth — staged rollout", () => {
  it("enforce + matching header ⇒ allowed, not rejected", () => {
    const r = checkVapiWebhookAuth(headers({ [VAPI_SECRET_HEADER]: SECRET }), {
      VAPI_WEBHOOK_SECRET: SECRET,
      VAPI_WEBHOOK_AUTH_MODE: "enforce",
    });
    expect(r).toMatchObject({ matched: true, shouldReject: false, mode: "enforce" });
  });

  it("enforce + wrong header ⇒ rejected", () => {
    const r = checkVapiWebhookAuth(headers({ [VAPI_SECRET_HEADER]: "nope" }), {
      VAPI_WEBHOOK_SECRET: SECRET,
      VAPI_WEBHOOK_AUTH_MODE: "enforce",
    });
    expect(r).toMatchObject({ matched: false, shouldReject: true });
  });

  it("enforce + missing header ⇒ rejected", () => {
    const r = checkVapiWebhookAuth(headers({}), {
      VAPI_WEBHOOK_SECRET: SECRET,
      VAPI_WEBHOOK_AUTH_MODE: "enforce",
    });
    expect(r).toMatchObject({ headerPresent: false, matched: false, shouldReject: true });
  });

  it("log mode + wrong header ⇒ NOT rejected (observe-only, still processes)", () => {
    const r = checkVapiWebhookAuth(headers({ [VAPI_SECRET_HEADER]: "nope" }), {
      VAPI_WEBHOOK_SECRET: SECRET,
      VAPI_WEBHOOK_AUTH_MODE: "log",
    });
    expect(r).toMatchObject({ matched: false, shouldReject: false, mode: "log" });
  });

  it("no secret configured ⇒ never rejects, even if mode=enforce (cannot lock out ingestion)", () => {
    const r = checkVapiWebhookAuth(headers({ [VAPI_SECRET_HEADER]: "anything" }), {
      VAPI_WEBHOOK_AUTH_MODE: "enforce",
    });
    expect(r).toMatchObject({ hasSecret: false, shouldReject: false });
  });

  it("off mode ⇒ never rejects", () => {
    const r = checkVapiWebhookAuth(headers({}), {
      VAPI_WEBHOOK_SECRET: SECRET,
      VAPI_WEBHOOK_AUTH_MODE: "off",
    });
    expect(r).toMatchObject({ shouldReject: false, mode: "off" });
  });
});

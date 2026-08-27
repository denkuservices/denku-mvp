import { describe, it, expect } from "vitest";
import { resolveSender, DEFAULT_SENDERS } from "@/lib/email/senders";

/**
 * R-080 — every sender must resolve to the verified denku.io domain; the sandbox
 * onboarding@resend.dev must be impossible to produce. Resolution order:
 * per-stream override -> RESEND_FROM -> verified default.
 */
describe("resolveSender", () => {
  it("uses verified denku.io defaults when nothing is configured", () => {
    expect(resolveSender("auth", {})).toBe("Denku <no-reply@denku.io>");
    expect(resolveSender("notify", {})).toBe("Denku <notifications@denku.io>");
    expect(resolveSender("welcome", {})).toBe("Denku <hello@denku.io>");
  });

  it("never resolves to the legacy sandbox sender for any stream", () => {
    for (const kind of ["auth", "notify", "welcome"] as const) {
      expect(resolveSender(kind, {})).not.toContain("resend.dev");
      expect(DEFAULT_SENDERS[kind]).toContain("@denku.io");
    }
  });

  it("falls back to the global RESEND_FROM when set", () => {
    const env = { RESEND_FROM: "Denku <hi@denku.io>" };
    expect(resolveSender("auth", env)).toBe("Denku <hi@denku.io>");
    expect(resolveSender("notify", env)).toBe("Denku <hi@denku.io>");
  });

  it("prefers the per-stream override over RESEND_FROM and the default", () => {
    const env = {
      RESEND_FROM: "Denku <hi@denku.io>",
      RESEND_FROM_AUTH: "Denku <login@denku.io>",
    };
    expect(resolveSender("auth", env)).toBe("Denku <login@denku.io>");
    // notify has no per-stream override → falls to global RESEND_FROM
    expect(resolveSender("notify", env)).toBe("Denku <hi@denku.io>");
  });

  it("ignores blank/whitespace env values and falls through", () => {
    expect(resolveSender("auth", { RESEND_FROM_AUTH: "   ", RESEND_FROM: "" })).toBe(
      "Denku <no-reply@denku.io>"
    );
  });
});

/**
 * The failure that made this necessary, 2026-08-27: `RESEND_FROM` was saved in Vercel with the
 * quote characters included — the shell form pasted into a web form. Resend answered every send
 * with a 422 `validation_error` about the `from` field, and because artifact notifications are
 * best-effort and release their claim on failure, nothing anywhere showed a problem: the flag was
 * on, the recipient was set, the appointment existed, and the owner simply never got an email.
 */
describe("resolveSender — a pasted value is still a value", () => {
  it("strips a wrapping pair of quotes, which is never part of an address", () => {
    expect(resolveSender("notify", { RESEND_FROM: '"Denku AI <hello@denku.io>"' })).toBe(
      "Denku AI <hello@denku.io>"
    );
    expect(resolveSender("auth", { RESEND_FROM_AUTH: "'Denku <no-reply@denku.io>'" })).toBe(
      "Denku <no-reply@denku.io>"
    );
  });

  it("leaves a correctly-formatted sender exactly as it is", () => {
    expect(resolveSender("notify", { RESEND_FROM: "Denku <notifications@denku.io>" })).toBe(
      "Denku <notifications@denku.io>"
    );
    expect(resolveSender("notify", { RESEND_FROM: "notifications@denku.io" })).toBe(
      "notifications@denku.io"
    );
  });

  it("does not strip a lone quote, which would corrupt rather than repair", () => {
    expect(resolveSender("notify", { RESEND_FROM: '"Denku <notifications@denku.io>' })).toBe(
      '"Denku <notifications@denku.io>'
    );
  });

  it("falls through to the default when the value was only quotes or spaces", () => {
    expect(resolveSender("welcome", { RESEND_FROM: '""' })).toBe(DEFAULT_SENDERS.welcome);
    expect(resolveSender("welcome", { RESEND_FROM: '"   "' })).toBe(DEFAULT_SENDERS.welcome);
  });
});

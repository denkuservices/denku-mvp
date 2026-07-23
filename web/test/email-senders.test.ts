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

import { describe, it, expect } from "vitest";
import { evaluateReadiness, summarizeReadiness } from "@/lib/launch/checks";

/** A fully launch-ready environment (all required checks pass). */
const READY_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_SITE_URL: "https://www.denku.io",
  VAPI_WEBHOOK_SECRET: "whsec",
  VAPI_WEBHOOK_AUTH_MODE: "enforce",
  ADMIN_USER: "u",
  ADMIN_PASS: "p",
  CRON_SECRET: "cron",
  VAPI_API_KEY: "vapi",
  VAPI_WEBHOOK_BASE_URL: "https://www.denku.io/api",
  OPENAI_API_KEY: "oai",
  RESEND_API_KEY: "re",
  STRIPE_SECRET_KEY: "sk",
  STRIPE_WEBHOOK_SECRET: "wh",
  BILLING_NOTIFICATIONS_ENABLED: "true",
  CSP_MODE: "enforce",
  NEXT_PUBLIC_SUPPORT_EMAIL: "support@denku.io",
};

function byId(env: Record<string, string | undefined>) {
  return new Map(evaluateReadiness(env).map((c) => [c.id, c]));
}

describe("readiness — pure evaluation", () => {
  it("a fully-configured env is READY (no required failures)", () => {
    const summary = summarizeReadiness(evaluateReadiness(READY_ENV));
    expect(summary.ready).toBe(true);
    expect(summary.requiredFailures).toEqual([]);
    expect(summary.counts.fail).toBe(0);
  });

  it("webhook observe-only FAILS and blocks launch (R-001)", () => {
    const c = byId({ ...READY_ENV, VAPI_WEBHOOK_AUTH_MODE: "log" });
    expect(c.get("webhook_enforce")!.status).toBe("fail");
    expect(c.get("webhook_enforce")!.required).toBe(true);
    expect(summarizeReadiness(evaluateReadiness({ ...READY_ENV, VAPI_WEBHOOK_AUTH_MODE: "log" })).ready).toBe(false);
  });

  it("localhost webhook base URL FAILS (R-077)", () => {
    const c = byId({ ...READY_ENV, VAPI_WEBHOOK_BASE_URL: "http://localhost:3000/api" });
    expect(c.get("webhook_base_url")!.status).toBe("fail");
  });

  it("missing required secrets FAIL and are reported as blockers", () => {
    const env = { ...READY_ENV } as Record<string, string | undefined>;
    delete env.STRIPE_SECRET_KEY;
    delete env.VAPI_WEBHOOK_SECRET;
    const summary = summarizeReadiness(evaluateReadiness(env));
    expect(summary.ready).toBe(false);
    expect(summary.requiredFailures).toContain("stripe_secret");
    expect(summary.requiredFailures).toContain("webhook_secret");
  });

  it("missing OpenAI key WARNs but does not block (regex fallback)", () => {
    const env = { ...READY_ENV } as Record<string, string | undefined>;
    delete env.OPENAI_API_KEY;
    const c = byId(env);
    expect(c.get("openai_api_key")!.status).toBe("warn");
    expect(c.get("openai_api_key")!.required).toBe(false);
    expect(summarizeReadiness(evaluateReadiness(env)).ready).toBe(true);
  });

  it("resend.dev sandbox sender FAILS the sender check (R-080), non-blocking", () => {
    const c = byId({ ...READY_ENV, RESEND_FROM: "onboarding@resend.dev" });
    expect(c.get("sender_domain")!.status).toBe("fail");
    expect(c.get("sender_domain")!.required).toBe(false);
  });

  it("CSP report-only WARNs (env-driven flip, non-blocking); enforce PASSes", () => {
    const env = { ...READY_ENV } as Record<string, string | undefined>;
    delete env.CSP_MODE;
    expect(byId(env).get("csp_mode")!.status).toBe("warn");
    expect(byId({ ...READY_ENV, CSP_MODE: "enforce" }).get("csp_mode")!.status).toBe("pass");
    // report-only never blocks launch
    expect(summarizeReadiness(evaluateReadiness(env)).ready).toBe(true);
  });

  it("billing notifications off WARNs (recommended for launch)", () => {
    const env = { ...READY_ENV } as Record<string, string | undefined>;
    delete env.BILLING_NOTIFICATIONS_ENABLED;
    const c = byId(env);
    expect(c.get("billing_notifications")!.status).toBe("warn");
  });

  it("platform flags are informational (pass regardless of state)", () => {
    const c = byId({ ...READY_ENV, PLATFORM_UX_ENABLED: "true", PLATFORM_MODEL_ENABLED: "false" });
    expect(c.get("platform_ux_flag")!.status).toBe("pass");
    expect(c.get("platform_model_flag")!.status).toBe("pass");
  });

  it("an empty env fails every required check but never throws", () => {
    const checks = evaluateReadiness({});
    const summary = summarizeReadiness(checks);
    expect(summary.ready).toBe(false);
    expect(summary.counts.fail).toBeGreaterThan(0);
  });
});

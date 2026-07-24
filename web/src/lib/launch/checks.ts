/**
 * Production Readiness Preflight — pure check engine (Sprint 6, L1 / R-098).
 *
 * `evaluateReadiness(env)` deterministically turns the environment into a list of readiness
 * checks — "are we safe to take a paying customer?" — with NO I/O, so it's fully unit-tested.
 * The async layer (lib/launch/readiness.ts) adds live DB probes and merges. Consumed by the
 * operator preflight endpoint/page (/api/admin/readiness). It reveals only presence/mode
 * (booleans, not secret values).
 *
 * `required: true` checks gate launch: any required check that is `fail` ⇒ NOT ready.
 */

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckCategory = "Core" | "Security" | "Voice" | "Email" | "Billing" | "Platform";

export interface ReadinessCheck {
  id: string;
  label: string;
  category: CheckCategory;
  status: CheckStatus;
  required: boolean;
  detail: string;
}

type Env = Record<string, string | undefined>;

const present = (v: string | undefined) => typeof v === "string" && v.trim().length > 0;
const isLocalish = (v: string) => /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(v);

function check(
  id: string,
  label: string,
  category: CheckCategory,
  required: boolean,
  status: CheckStatus,
  detail: string
): ReadinessCheck {
  return { id, label, category, status, required, detail };
}

export function evaluateReadiness(env: Env): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  // --- Core ---
  checks.push(
    check("supabase_url", "Supabase URL", "Core", true, present(env.NEXT_PUBLIC_SUPABASE_URL) ? "pass" : "fail",
      present(env.NEXT_PUBLIC_SUPABASE_URL) ? "Set" : "NEXT_PUBLIC_SUPABASE_URL missing")
  );
  checks.push(
    check("supabase_service_key", "Supabase service-role key", "Core", true, present(env.SUPABASE_SERVICE_ROLE_KEY) ? "pass" : "fail",
      present(env.SUPABASE_SERVICE_ROLE_KEY) ? "Set" : "SUPABASE_SERVICE_ROLE_KEY missing")
  );
  checks.push(
    check("supabase_anon_key", "Supabase anon key", "Core", true, present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? "pass" : "fail",
      present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? "Set" : "NEXT_PUBLIC_SUPABASE_ANON_KEY missing")
  );
  {
    const url = env.NEXT_PUBLIC_SITE_URL;
    const status: CheckStatus = !present(url) ? "fail" : isLocalish(url!) ? "fail" : url!.startsWith("https://") ? "pass" : "warn";
    checks.push(check("site_url", "Public site URL", "Core", true, status,
      !present(url) ? "NEXT_PUBLIC_SITE_URL missing" : isLocalish(url!) ? `Points at localhost: ${url}` : url!.startsWith("https://") ? url! : `Not https: ${url}`));
  }

  // --- Security ---
  checks.push(
    check("webhook_secret", "Vapi webhook secret", "Security", true, present(env.VAPI_WEBHOOK_SECRET) ? "pass" : "fail",
      present(env.VAPI_WEBHOOK_SECRET) ? "Set" : "VAPI_WEBHOOK_SECRET missing")
  );
  {
    // R-001 (Critical): the webhook processes forged requests until this is 'enforce'.
    const mode = (env.VAPI_WEBHOOK_AUTH_MODE ?? "").toLowerCase().trim();
    const status: CheckStatus = mode === "enforce" ? "pass" : "fail";
    checks.push(check("webhook_enforce", "Vapi webhook auth = enforce", "Security", true, status,
      mode === "enforce" ? "Enforcing" : `Observe-only (${mode || "unset"}) — forged webhooks are processed (R-001)`));
  }
  checks.push(
    check("admin_creds", "Admin Basic-Auth credentials", "Security", true, present(env.ADMIN_USER) && present(env.ADMIN_PASS) ? "pass" : "fail",
      present(env.ADMIN_USER) && present(env.ADMIN_PASS) ? "Set" : "ADMIN_USER / ADMIN_PASS missing")
  );
  {
    // CSP flip is env-driven (CSP_MODE) as of Sprint 6 L3 — enforce only after reviewing
    // /api/csp-report. Report-only is a safe launch default, so this warns, never blocks.
    const enforce = (env.CSP_MODE ?? "").toLowerCase().trim() === "enforce";
    checks.push(check("csp_mode", "Content-Security-Policy mode", "Security", false, enforce ? "pass" : "warn",
      enforce ? "Enforcing" : "Report-only — safe default; set CSP_MODE=enforce after reviewing /api/csp-report (R-056)"));
  }
  checks.push(
    check("cron_secret", "Cron secret", "Security", true, present(env.CRON_SECRET) ? "pass" : "fail",
      present(env.CRON_SECRET) ? "Set" : "CRON_SECRET missing (billing cron unprotected/undeployed)")
  );

  // --- Voice ---
  checks.push(
    check("vapi_api_key", "Vapi API key", "Voice", true, present(env.VAPI_API_KEY) ? "pass" : "fail",
      present(env.VAPI_API_KEY) ? "Set" : "VAPI_API_KEY missing")
  );
  {
    const base = env.VAPI_WEBHOOK_BASE_URL;
    const status: CheckStatus = !present(base) ? "fail" : isLocalish(base!) ? "fail" : base!.startsWith("https://") ? "pass" : "warn";
    checks.push(check("webhook_base_url", "Vapi webhook base URL", "Voice", true, status,
      !present(base) ? "VAPI_WEBHOOK_BASE_URL missing" : isLocalish(base!) ? `localhost — live assistants would call your dev machine (R-077): ${base}` : base!));
  }
  checks.push(
    check("openai_api_key", "OpenAI API key (AI intent)", "Voice", false, present(env.OPENAI_API_KEY) ? "pass" : "warn",
      present(env.OPENAI_API_KEY) ? "Set — AI-primary intent (R-019)" : "Missing — intent falls back to regex-only")
  );

  // --- Email ---
  checks.push(
    check("resend_api_key", "Resend API key", "Email", true, present(env.RESEND_API_KEY) ? "pass" : "fail",
      present(env.RESEND_API_KEY) ? "Set" : "RESEND_API_KEY missing")
  );
  {
    const senders = [env.RESEND_FROM, env.RESEND_FROM_AUTH, env.RESEND_FROM_NOTIFY, env.RESEND_FROM_WELCOME].filter(present) as string[];
    const sandbox = senders.some((s) => /resend\.dev/i.test(s));
    const status: CheckStatus = sandbox ? "fail" : "pass";
    checks.push(check("sender_domain", "Verified sender domain", "Email", false, status,
      sandbox ? "A RESEND_FROM_* uses the resend.dev sandbox — mail will not deliver to customers (R-080)" : senders.length ? senders.join(", ") : "Defaults to verified denku.io"));
  }

  // --- Billing ---
  checks.push(
    check("stripe_secret", "Stripe secret key", "Billing", true, present(env.STRIPE_SECRET_KEY) ? "pass" : "fail",
      present(env.STRIPE_SECRET_KEY) ? "Set" : "STRIPE_SECRET_KEY missing")
  );
  checks.push(
    check("stripe_webhook_secret", "Stripe webhook secret", "Billing", true, present(env.STRIPE_WEBHOOK_SECRET) ? "pass" : "fail",
      present(env.STRIPE_WEBHOOK_SECRET) ? "Set" : "STRIPE_WEBHOOK_SECRET missing")
  );
  {
    const on = (env.BILLING_NOTIFICATIONS_ENABLED ?? "").toLowerCase().trim() === "true";
    checks.push(check("billing_notifications", "Billing/usage notifications", "Billing", false, on ? "pass" : "warn",
      on ? "Enabled — usage alerts + pause emails send (R-009)" : "Off — no usage-warning or pause emails to owners"));
  }

  // --- Platform (flag states — informational; not launch gates) ---
  {
    const on = (env.PLATFORM_MODEL_ENABLED ?? "").toLowerCase().trim() === "true";
    checks.push(check("platform_model_flag", "Platform model dual-writes", "Platform", false, "pass",
      on ? "On — voice/IG mirror into the shared model" : "Off — legacy stores only (fine for voice launch)"));
  }
  {
    const on = (env.PLATFORM_UX_ENABLED ?? "").toLowerCase().trim() === "true";
    checks.push(check("platform_ux_flag", "Platform experience (AI Employees IA)", "Platform", false, "pass",
      on ? "On — AI Employees IA served" : "Off — legacy dashboard served (fine for voice launch)"));
  }

  return checks;
}

export interface ReadinessSummary {
  ready: boolean;
  counts: Record<CheckStatus, number>;
  requiredFailures: string[];
}

/** A launch is "ready" when no REQUIRED check is failing. Pure. */
export function summarizeReadiness(checks: ReadinessCheck[]): ReadinessSummary {
  const counts: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0 };
  const requiredFailures: string[] = [];
  for (const c of checks) {
    counts[c.status] += 1;
    if (c.required && c.status === "fail") requiredFailures.push(c.id);
  }
  return { ready: requiredFailures.length === 0, counts, requiredFailures };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluateReadiness, summarizeReadiness, type ReadinessCheck, type ReadinessSummary } from "@/lib/launch/checks";

/**
 * Async readiness layer (Sprint 6, L1) — env checks (pure) + live DB probes, merged into one
 * report. Probes are best-effort and never throw: a probe error becomes a `warn`, never a
 * crash. Read-only.
 */

export interface ReadinessReport {
  generatedAt: string;
  summary: ReadinessSummary;
  checks: ReadinessCheck[];
}

/**
 * Does a public table/view exist? Probes the relation directly (PostgREST blocks
 * information_schema). A `head` count on a missing relation returns undefined_table (42P01)
 * → false; success → true; any other error → null ("couldn't probe"). Service role bypasses RLS.
 */
async function relationExists(db: SupabaseClient, name: string): Promise<boolean | null> {
  try {
    const { error } = await db.from(name).select("*", { head: true, count: "exact" }).limit(1);
    if (!error) return true;
    const code = (error as { code?: string }).code;
    const msg = (error.message || "").toLowerCase();
    if (code === "42P01" || msg.includes("does not exist") || msg.includes("not find the table")) return false;
    return null;
  } catch {
    return null;
  }
}

async function dbProbes(db: SupabaseClient): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  const employeeChannels = await relationExists(db, "employee_channels");
  checks.push({
    id: "platform_migrations",
    label: "Platform model migrations applied",
    category: "Platform",
    required: false,
    status: employeeChannels === true ? "pass" : employeeChannels === false ? "warn" : "warn",
    detail:
      employeeChannels === true
        ? "employee_channels present — 20260724* migrations applied"
        : employeeChannels === false
          ? "Not applied — required before PLATFORM_MODEL_ENABLED (see SPRINT_4.5_MIGRATION.md)"
          : "Could not probe (read-only/permission) — verify manually",
  });

  const overages = await relationExists(db, "org_monthly_overages");
  checks.push({
    id: "billing_views",
    label: "Billing usage views present",
    category: "Billing",
    required: false,
    status: overages === true ? "pass" : "warn",
    detail:
      overages === true
        ? "org_monthly_overages present (R-075 billing math)"
        : "Not found or unprobed — verify the billing views migration is applied",
  });

  return checks;
}

export async function getReadinessReport(
  env: Record<string, string | undefined> = process.env,
  db: SupabaseClient = supabaseAdmin
): Promise<ReadinessReport> {
  const envChecks = evaluateReadiness(env);
  let probeChecks: ReadinessCheck[] = [];
  try {
    probeChecks = await dbProbes(db);
  } catch {
    // never let a probe failure break the report
    probeChecks = [];
  }
  const checks = [...envChecks, ...probeChecks];
  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeReadiness(checks),
    checks,
  };
}

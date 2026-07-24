import { NextResponse } from "next/server";
import { getReadinessReport } from "@/lib/launch/readiness";

export const dynamic = "force-dynamic";

/**
 * Production Readiness Preflight endpoint (Sprint 6, L1 / R-098).
 *
 * Operator-only: lives under /api/admin/* so the middleware Basic-Auth gate protects it
 * (platform operators, never customer browsers). Returns the readiness report — presence/mode
 * booleans + live DB probes, never secret values. `ready` is false when any REQUIRED check
 * fails: the go/no-go for taking a paying customer.
 */
export async function GET() {
  const report = await getReadinessReport();
  return NextResponse.json(report, {
    status: report.summary.ready ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

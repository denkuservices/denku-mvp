import { NextResponse } from "next/server";
import { getReadinessReport } from "@/lib/launch/readiness";
import { getCutoverReport } from "@/lib/platform/cutoverProbe";

export const dynamic = "force-dynamic";

/**
 * Production Readiness Preflight endpoint (Sprint 6, L1 / R-098).
 *
 * Operator-only: lives under /api/admin/* so the middleware Basic-Auth gate protects it
 * (platform operators, never customer browsers). Returns the readiness report — presence/mode
 * booleans + live DB probes, never secret values. `ready` is false when any REQUIRED check
 * fails: the go/no-go for taking a paying customer.
 *
 * Also carries the `cutover` gate (redesign Phase 1). The HTTP status deliberately keeps
 * tracking launch readiness only — an unflipped platform flag is not a launch blocker, and
 * conflating the two would break whatever already polls this endpoint.
 */
export async function GET() {
  const [report, cutover] = await Promise.all([getReadinessReport(), getCutoverReport()]);
  return NextResponse.json(
    { ...report, cutover },
    {
      status: report.summary.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { runUsageThresholdAlerts } from "@/lib/billing/usageAlerts";

/**
 * Daily cron (R-009): email orgs that cross 50/75/90% of included minutes.
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron) or `x-cron-secret`.
 * Staged: no-ops unless `BILLING_NOTIFICATIONS_ENABLED=true`.
 */
export const dynamic = "force-dynamic";

function verifyCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1] === expected) return true;
  }

  const incoming = req.headers.get("x-cron-secret") || req.headers.get("cron-secret");
  return incoming === expected;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runUsageThresholdAlerts();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[USAGE_ALERTS][CRON] Unexpected error:", message);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

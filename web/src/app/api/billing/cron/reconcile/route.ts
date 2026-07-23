import { NextRequest, NextResponse } from "next/server";
import { runBillingReconciliation } from "@/lib/billing/reconciliation";

/**
 * Monthly cron (R-076): reconcile COGS vs revenue per org and log margin alerts.
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron) or `x-cron-secret`.
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
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? undefined;
    const result = await runBillingReconciliation(month && /^\d{4}-\d{2}-01$/.test(month) ? month : undefined);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[BILLING][RECONCILE][CRON] Unexpected error:", message);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

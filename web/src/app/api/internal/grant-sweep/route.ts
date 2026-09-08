import { NextRequest, NextResponse } from "next/server";
import { runGrantSweep } from "@/lib/billing/trialEnforcement";

/**
 * Daily cron: retire lapsed grants, hand back the phone numbers they rented, and pause trial
 * workspaces that have run out of time or minutes.
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` (Vercel cron) or `x-cron-secret` — the same shape as
 * the billing crons, deliberately, so an operator testing this by hand does not have to learn a
 * second convention.
 *
 * **This route is not optional infrastructure.** `grants.ts` decides entitlement from the dates, so
 * a lapsed trial stops granting on its own — but a rented Vapi number goes on billing every month
 * until something calls it back, and nothing else in the product ever will. Skipping this cron does
 * not break a trial; it just quietly costs money forever.
 *
 * It is also NOT gated by `BILLING_NOTIFICATIONS_ENABLED`, unlike the usage-alert cron. That flag
 * stages customer EMAIL. This spends and un-spends money, and staging it behind a notification
 * switch would mean an environment with emails off never releases a number.
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
    const result = await runGrantSweep();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[TRIAL][SWEEP][CRON] Unexpected error:", message);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

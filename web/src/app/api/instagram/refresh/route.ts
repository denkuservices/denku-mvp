import { NextRequest, NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth/basic";
import { getRefreshableConnections, saveRefreshedToken } from "@/lib/instagram/connections";
import { refreshLongLivedToken } from "@/lib/instagram/client";
import { isInstagramOAuthConfigured } from "@/lib/instagram/config";

export const dynamic = "force-dynamic";

/**
 * POST /api/instagram/refresh — Basic-Auth internal job (like the billing/reconcile
 * repair endpoints). Refreshes long-lived Instagram tokens nearing expiry so
 * connections don't silently die at 60 days. A Vercel cron can call this daily
 * (wiring the cron is an operator step). Idempotent; never throws.
 */
export async function POST(req: NextRequest) {
  if (!requireBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isInstagramOAuthConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const targets = await getRefreshableConnections(10); // within 10 days of expiry
  let refreshed = 0;
  const failures: { orgId: string; error: string }[] = [];

  for (const t of targets) {
    try {
      const next = await refreshLongLivedToken(t.accessToken);
      await saveRefreshedToken(t.orgId, next.accessToken, next.expiresInSec);
      refreshed += 1;
    } catch (err) {
      failures.push({ orgId: t.orgId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.info("[INSTAGRAM][REFRESH]", { candidates: targets.length, refreshed, failed: failures.length });
  return NextResponse.json({ ok: failures.length === 0, candidates: targets.length, refreshed, failed: failures.length, failures });
}

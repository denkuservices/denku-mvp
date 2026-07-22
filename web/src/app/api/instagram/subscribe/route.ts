import { NextRequest, NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth/basic";
import { isSecretBoxConfigured } from "@/lib/crypto/secretBox";
import { listConnectedOrgIds } from "@/lib/instagram/connections";
import { subscribeInstagramAccount } from "@/lib/instagram/subscribe";
import { logEvent } from "@/lib/observability/logEvent";

export const dynamic = "force-dynamic";

/**
 * POST /api/instagram/subscribe — Basic-Auth backfill (like the other /api/instagram
 * ops endpoints). Subscribes every already-connected Instagram account to its
 * scope-backed webhook fields via /subscribed_apps — WITHOUT requiring the user to
 * reconnect. Idempotent and safe to run repeatedly. Reports per-org results.
 */
export async function POST(req: NextRequest) {
  if (!requireBasicAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSecretBoxConfigured()) {
    // Needs the encryption key to decrypt stored tokens.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const orgIds = await listConnectedOrgIds();
  const results: { orgId: string; ok: boolean; fields: string[]; error?: string }[] = [];
  for (const orgId of orgIds) {
    const r = await subscribeInstagramAccount(orgId);
    results.push({ orgId, ok: r.ok, fields: r.fields, error: r.error });
  }

  const subscribed = results.filter((r) => r.ok).length;
  logEvent({
    tag: "[INSTAGRAM][SUBSCRIBE][BACKFILL]",
    ts: Date.now(),
    stage: "TOOL",
    source: "system",
    severity: subscribed < results.length ? "warn" : "info",
    details: { total: results.length, subscribed, failed: results.length - subscribed },
  });

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    total: results.length,
    subscribed,
    failed: results.length - subscribed,
    results,
  });
}

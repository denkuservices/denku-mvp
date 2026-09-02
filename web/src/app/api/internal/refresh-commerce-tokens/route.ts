import { NextRequest, NextResponse } from "next/server";
import { connectionsDueForRefresh, getAccessToken } from "@/lib/commerce/tokens";
import { refreshIdeasoftToken } from "@/lib/commerce/providers/ideasoft/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keep every connected store's grant alive.
 *
 * This is not an optimisation. IdeaSoft's refresh token expires after **two months**, and it is
 * consumed by every use — so a store nobody happens to ask a question about for two months loses
 * its connection, and the owner has to walk back through their admin panel to restore it. A daily
 * sweep means the token is always fresh and the grant never lapses.
 *
 * Idempotent and safe to run twice: `getAccessToken` claims a single-flight lock, so a second
 * concurrent run waits for the first rather than racing it to spend the same single-use token.
 *
 * A failure here is logged and skipped, never thrown — one broken store must not stop the sweep
 * for every other one.
 */

function authorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Anything expiring within a day. The cron runs daily, so this is one full period of overlap:
  // a single missed run still refreshes everything before it lapses.
  const due = await connectionsDueForRefresh(24 * 60 * 60 * 1000);

  let refreshed = 0;
  let failed = 0;

  for (const connection of due) {
    try {
      const result = await getAccessToken(
        { id: connection.id, storeBaseUrl: connection.storeBaseUrl },
        refreshIdeasoftToken
      );
      if (result.ok) refreshed++;
      else {
        failed++;
        console.warn("[COMMERCE][CRON][REFRESH][FAILED]", {
          connection_id: connection.id,
          org_id: connection.orgId,
          reason: result.reason,
          needs_reauth: Boolean(result.needsReauth),
        });
      }
    } catch (err) {
      failed++;
      console.error("[COMMERCE][CRON][REFRESH][ERROR]", err instanceof Error ? err.message : String(err));
    }
  }

  console.info("[COMMERCE][CRON][REFRESH][DONE]", { due: due.length, refreshed, failed });
  return NextResponse.json({ ok: true, due: due.length, refreshed, failed });
}

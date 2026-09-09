import { NextRequest, NextResponse } from "next/server";
import { guardPlatformAdmin } from "@/lib/platform-admin/access";
import { revokeGrant } from "@/lib/platform-admin/grantService";

/**
 * POST /api/admin/platform/grants/:grantId/revoke — end a trial now.
 *
 * A POST rather than a DELETE because it is not only a row change: revoking releases any phone
 * number the grant was paying for, which is an outward effect on Vapi. The response says how many
 * lines went back, so the operator can see that the money actually stopped.
 */

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const gate = await guardPlatformAdmin();
  if (!gate.ok) return gate.response;

  const { grantId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(grantId)) {
    return NextResponse.json({ ok: false, error: "Invalid grant id" }, { status: 400 });
  }

  const result = await revokeGrant({ grantId, actorUserId: gate.admin.userId });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, linesReleased: result.linesReleased });
}

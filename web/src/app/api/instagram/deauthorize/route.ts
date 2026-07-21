import { NextRequest, NextResponse } from "next/server";
import { getInstagramConfig } from "@/lib/instagram/config";
import { parseSignedRequest } from "@/lib/instagram/signedRequest";
import { revokeByIgUserId } from "@/lib/instagram/connections";

export const dynamic = "force-dynamic";

/**
 * Meta DEAUTHORIZE callback (Business Login Settings → "Deauthorize callback URL").
 * Called when a user removes the app. Body is a form-encoded `signed_request`
 * (HMAC-SHA256 with the app secret). We verify it and revoke the connection.
 * Not a data-deletion request — that is a separate callback. Always returns 200.
 */
export async function POST(req: NextRequest) {
  const { appSecret } = getInstagramConfig();
  if (!appSecret) {
    console.error("[INSTAGRAM][DEAUTH][NOT_CONFIGURED]");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signedRequest = await readSignedRequest(req);
  const parsed = parseSignedRequest(signedRequest, appSecret);
  if (!parsed) {
    console.warn("[INSTAGRAM][DEAUTH][SIG][INVALID]");
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 401 });
  }

  try {
    const { orgId } = await revokeByIgUserId(parsed.userId ?? "");
    console.info("[INSTAGRAM][DEAUTH][OK]", { igUserId: parsed.userId, orgId });
  } catch (err) {
    console.error("[INSTAGRAM][DEAUTH][REVOKE][FAILED]", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return NextResponse.json({ ok: true });
}

/** Meta sends `signed_request` form-encoded; tolerate JSON too. */
async function readSignedRequest(req: NextRequest): Promise<string | null> {
  const body = await req.text();
  if (!body) return null;
  const params = new URLSearchParams(body);
  const fromForm = params.get("signed_request");
  if (fromForm) return fromForm;
  try {
    const json = JSON.parse(body);
    return typeof json?.signed_request === "string" ? json.signed_request : null;
  } catch {
    return null;
  }
}

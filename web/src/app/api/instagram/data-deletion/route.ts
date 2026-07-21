import { NextRequest, NextResponse } from "next/server";
import { getInstagramConfig } from "@/lib/instagram/config";
import { parseSignedRequest } from "@/lib/instagram/signedRequest";
import { processDataDeletion } from "@/lib/instagram/dataDeletion";

export const dynamic = "force-dynamic";

/**
 * Meta DATA DELETION REQUEST callback (Business Login Settings → "Data Deletion
 * Request URL"). Body is a form-encoded `signed_request`. We verify it, hard-delete
 * the account's data (connection + persisted webhook events), and MUST respond with
 * `{ url, confirmation_code }` per Meta spec — a status URL the user can check.
 */
export async function POST(req: NextRequest) {
  const { appSecret } = getInstagramConfig();
  if (!appSecret) {
    console.error("[INSTAGRAM][DATA_DELETION][NOT_CONFIGURED]");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signedRequest = await readSignedRequest(req);
  const parsed = parseSignedRequest(signedRequest, appSecret);
  if (!parsed) {
    console.warn("[INSTAGRAM][DATA_DELETION][SIG][INVALID]");
    return NextResponse.json({ error: "invalid_signed_request" }, { status: 401 });
  }

  const { confirmationCode, status } = await processDataDeletion(parsed.userId);
  console.info("[INSTAGRAM][DATA_DELETION][PROCESSED]", {
    igUserId: parsed.userId,
    status,
    code: confirmationCode,
  });

  const statusUrl = new URL(
    `/instagram-data-deletion?code=${confirmationCode}`,
    req.nextUrl.origin
  ).toString();

  // Meta requires exactly this shape.
  return NextResponse.json({ url: statusUrl, confirmation_code: confirmationCode });
}

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

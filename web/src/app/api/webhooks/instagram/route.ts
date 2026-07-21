import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getInstagramConfig, isInstagramWebhookConfigured } from "@/lib/instagram/config";
import { verifyMetaSignature } from "@/lib/instagram/signature";
import { getOrgIdByIgUserId } from "@/lib/instagram/connections";

export const dynamic = "force-dynamic";

/**
 * Instagram webhook (Sprint 1.5). RECEIVE + PERSIST ONLY — no business logic,
 * no replies, no AI. Meta always signs POSTs, so signature verification is
 * enforced from day one (no staged rollout needed, unlike the Vapi webhook R-001).
 *
 *   GET  → verification handshake (hub.challenge) using VERIFY_TOKEN.
 *   POST → verify X-Hub-Signature-256, persist each entry to
 *          `instagram_webhook_events`, return 200. Forged/unsigned → 401, no write.
 */

// --- GET: Meta verification handshake ---------------------------------------
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  const { verifyToken } = getInstagramConfig();

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    console.info("[INSTAGRAM][WEBHOOK][VERIFY][OK]");
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  console.warn("[INSTAGRAM][WEBHOOK][VERIFY][REJECTED]", { mode, hasToken: !!token });
  return new NextResponse("Forbidden", { status: 403 });
}

// --- POST: receive + persist -------------------------------------------------
export async function POST(req: NextRequest) {
  if (!isInstagramWebhookConfigured()) {
    console.error("[INSTAGRAM][WEBHOOK][NOT_CONFIGURED]");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Raw body is required for signature verification — read it BEFORE parsing.
  const rawBody = await req.text();
  const { appSecret } = getInstagramConfig();
  const signature = req.headers.get("x-hub-signature-256");
  const valid = verifyMetaSignature(rawBody, signature, appSecret);

  if (!valid) {
    console.warn("[INSTAGRAM][WEBHOOK][SIG][INVALID]", { hasSignature: !!signature });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  type IgEntry = {
    id?: string | number;
    messaging?: unknown;
    changes?: unknown;
    standby?: unknown;
  };
  type IgPayload = { object?: unknown; entry?: unknown };

  let payload: IgPayload | null = null;
  try {
    payload = JSON.parse(rawBody) as IgPayload;
  } catch {
    console.warn("[INSTAGRAM][WEBHOOK][BAD_JSON]");
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const headers = {
    "x-hub-signature-256": signature ?? null,
    "content-type": req.headers.get("content-type") ?? null,
  };
  const object: string | null = typeof payload?.object === "string" ? payload.object : null;
  const entries: IgEntry[] = Array.isArray(payload?.entry) ? (payload.entry as IgEntry[]) : [];

  const rows: Record<string, unknown>[] = [];
  if (entries.length === 0) {
    rows.push({
      object,
      payload,
      headers,
      signature_valid: true,
      event_type: null,
      processed: false,
    });
  } else {
    for (const entry of entries) {
      const igUserId = entry?.id != null ? String(entry.id) : null;
      const eventType = entry?.messaging
        ? "messages"
        : entry?.changes
          ? "changes"
          : entry?.standby
            ? "standby"
            : null;
      const orgId = igUserId ? await getOrgIdByIgUserId(igUserId).catch(() => null) : null;
      rows.push({
        org_id: orgId,
        object,
        entry_id: igUserId,
        ig_user_id: igUserId,
        event_type: eventType,
        payload: entry,
        headers,
        signature_valid: true,
        processed: false,
      });
    }
  }

  try {
    const { error } = await supabaseAdmin.from("instagram_webhook_events").insert(rows);
    if (error) {
      // Persist failure must not make Meta retry forever into a broken table; log loud, 200.
      console.error("[INSTAGRAM][WEBHOOK][PERSIST][FAILED]", { error: error.message, count: rows.length });
    } else {
      console.info("[INSTAGRAM][WEBHOOK][RECEIVED]", { object, entries: rows.length });
    }
  } catch (err) {
    console.error("[INSTAGRAM][WEBHOOK][PERSIST][EXCEPTION]", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Always 200 to a validly-signed Meta request (Meta disables endpoints that error).
  return NextResponse.json({ ok: true });
}

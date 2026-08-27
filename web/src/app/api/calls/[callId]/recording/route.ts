import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VAPI_BASE_URL } from "@/lib/vapi/server";

/**
 * Play a call recording (2026-08-27).
 *
 * The Inbox used to point an `<audio>` tag straight at the URL Vapi puts in the webhook payload —
 * a raw `*.r2.cloudflarestorage.com/hipaa-recordings/...` object with no signature. Vapi has since
 * made recording storage **access-controlled**, so that anonymous fetch now fails and the play
 * button does nothing, silently: `<audio>` reports a network error the page never surfaced.
 *
 * The supported path is `GET /call/{id}/{artifact}` with the **private** API key, which answers
 * `302` with a short-lived signed URL. That key must never reach the browser, so this route stands
 * between them: it authenticates the operator, proves the call belongs to their org, asks Vapi for
 * a fresh signed URL, and redirects the browser to it. Bytes stream from Cloudflare to the browser
 * directly — we forward a URL, not audio.
 *
 * The signed URL is deliberately NOT cached: it expires quickly, and `<audio>` re-requests this
 * route on every seek (Range), which is exactly when a stale URL would 403.
 */

export const dynamic = "force-dynamic";

/** Mono is what the player wants — one combined channel. Stereo is the fallback Vapi documents. */
const ARTIFACTS = ["mono-recording", "stereo-recording"] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "Missing org" }, { status: 403 });
  }

  // Org scoping is the whole security boundary here: a recording is a customer's voice.
  const { data: call } = await supabaseAdmin
    .from("calls")
    .select("id, vapi_call_id")
    .eq("id", callId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; vapi_call_id: string | null }>();

  if (!call?.vapi_call_id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const key = process.env.VAPI_API_KEY;
  if (!key) {
    console.error("[CALLS][RECORDING][NO_API_KEY]");
    return NextResponse.json({ ok: false, error: "Recording unavailable" }, { status: 503 });
  }

  for (const artifact of ARTIFACTS) {
    try {
      const res = await fetch(`${VAPI_BASE_URL}/call/${call.vapi_call_id}/${artifact}`, {
        headers: { Authorization: `Bearer ${key}` },
        redirect: "manual",
        cache: "no-store",
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        console.log("[CALLS][RECORDING][SIGNED]", { callId, artifact });
        // 302, not 307: this is a lookup that may resolve elsewhere next time, never a cached one.
        return NextResponse.redirect(location, {
          status: 302,
          headers: { "Cache-Control": "no-store, private" },
        });
      }

      console.warn("[CALLS][RECORDING][MISS]", { callId, artifact, status: res.status });
    } catch (err) {
      console.error("[CALLS][RECORDING][FETCH_FAILED]", {
        callId,
        artifact,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: false, error: "Recording unavailable" }, { status: 404 });
}

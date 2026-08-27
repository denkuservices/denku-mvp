import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VAPI_BASE_URL } from "@/lib/vapi/server";

/**
 * Play a call recording (2026-08-27, corrected 2026-08-28).
 *
 * The Inbox used to point an `<audio>` tag straight at the URL Vapi puts in the webhook payload —
 * a raw `*.r2.cloudflarestorage.com` object with no signature. Vapi has since made recording
 * storage access-controlled, and that URL now answers **HTTP 400** to anyone (verified with curl),
 * so the play button did nothing and said nothing: `<audio>` fails by going quiet.
 *
 * The supported path is `GET /call/{id}/{artifact}` with the **private** API key, which answers
 * `302` with a short-lived signed URL. That key must never reach the browser, so this route stands
 * between them.
 *
 * **Why it streams the bytes instead of redirecting the browser to that signed URL.** The CSP in
 * `next.config.ts` allows `media-src 'self' blob: https://*.daily.co` — Cloudflare's host is not
 * on it. That CSP is report-only today, so a redirect does work; it would stop working the day
 * anyone flips CSP to enforcing, and it would fail exactly the way this bug already failed once,
 * silently. Serving from our own origin is immune to that, and costs one pass through the function
 * for a file an owner plays occasionally.
 *
 * An earlier version of this comment blamed the media element for not following the cross-origin
 * redirect. That was wrong: measured in the browser, a same-origin proxied response hangs
 * identically, and so does a locally-generated 1.6 KB tone — the test browser cannot play audio at
 * all. The redirect was never proven guilty. The CSP argument above is the real reason, and the
 * range handling below is worth having either way.
 *
 * Range requests are forwarded and a `206` is answered as a `206`, so seeking works.
 */

export const dynamic = "force-dynamic";

/** Mono is what the player wants — one combined channel. Stereo is the fallback Vapi documents. */
const ARTIFACTS = ["mono-recording", "stereo-recording"] as const;

export async function GET(
  req: NextRequest,
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

  // The player asks for a byte range on open and again on every seek; pass it straight through.
  const range = req.headers.get("range");

  for (const artifact of ARTIFACTS) {
    try {
      const signed = await fetch(`${VAPI_BASE_URL}/call/${call.vapi_call_id}/${artifact}`, {
        headers: { Authorization: `Bearer ${key}` },
        redirect: "manual",
        cache: "no-store",
      });

      const location = signed.headers.get("location");
      if (!(signed.status >= 300 && signed.status < 400 && location)) {
        console.warn("[CALLS][RECORDING][MISS]", { callId, artifact, status: signed.status });
        continue;
      }

      const audio = await fetch(location, {
        headers: range ? { Range: range } : undefined,
        cache: "no-store",
      });

      if (!audio.ok || !audio.body) {
        console.warn("[CALLS][RECORDING][FETCH_STATUS]", { callId, artifact, status: audio.status });
        continue;
      }

      const headers = new Headers();
      headers.set("Content-Type", audio.headers.get("content-type") || "audio/wav");
      // Without this the player cannot seek: it has to know ranges are on offer.
      headers.set("Accept-Ranges", "bytes");
      for (const h of ["content-length", "content-range"]) {
        const v = audio.headers.get(h);
        if (v) headers.set(h, v);
      }
      // A recording is one customer's voice. It must never sit in a shared cache.
      headers.set("Cache-Control", "private, no-store");

      console.log("[CALLS][RECORDING][SERVED]", { callId, artifact, status: audio.status, range: Boolean(range) });
      return new NextResponse(audio.body, { status: audio.status, headers });
    } catch (err) {
      console.error("[CALLS][RECORDING][FAILED]", {
        callId,
        artifact,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: false, error: "Recording unavailable" }, { status: 404 });
}

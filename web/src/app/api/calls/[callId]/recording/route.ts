import { NextRequest, NextResponse } from "next/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { VAPI_BASE_URL } from "@/lib/vapi/server";

/**
 * Play a call recording (2026-08-27, rewritten 2026-08-28 after watching it fail).
 *
 * The Inbox used to point an `<audio>` tag straight at the URL Vapi puts in the webhook payload —
 * a raw `*.r2.cloudflarestorage.com` object with no signature. Vapi has since made recording
 * storage access-controlled, so that anonymous fetch fails and the play button does nothing,
 * silently: `<audio>` reports a network error the page never surfaced.
 *
 * The supported path is `GET /call/{id}/{artifact}` with the **private** API key, which answers
 * `302` with a short-lived signed URL. That key must never reach the browser, so this route stands
 * between them.
 *
 * **It streams the audio rather than redirecting to it, and that part was learned the hard way.**
 * The first version answered `302` and let the browser follow. Measured on production: a plain
 * `fetch()` of this route returned the file in 2.7s, while the `<audio>` element on the same page
 * sat at `networkState: LOADING`, `readyState: 0`, nothing buffered and **no error** — for as long
 * as you cared to wait. A media element does not fetch like a script does: it opens with a range
 * request and follows its own rules about cross-origin redirects, and it fails by hanging rather
 * than by telling you. Proxying the bytes removes the redirect, keeps everything same-origin, and
 * costs one pass through the function for a file an owner plays occasionally.
 *
 * Range requests are forwarded and their `206` answered as a `206`, so seeking works.
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

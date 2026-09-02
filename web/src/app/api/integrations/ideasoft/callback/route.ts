import { NextRequest, NextResponse } from "next/server";
import { consumeOauthState, markError, saveTokens } from "@/lib/commerce/connections";
import { exchangeAuthorizationCode } from "@/lib/commerce/providers/ideasoft/oauth";
import { readerFor } from "@/lib/commerce/registry";
import { markVerified } from "@/lib/commerce/connections";
import { getBaseUrl } from "@/lib/utils/url";

export const dynamic = "force-dynamic";

/**
 * Step two: the store owner has approved, and IdeaSoft has sent them back here with a code.
 *
 * Three things make this route what it is:
 *
 *   1. **The `state` is the only thing believed.** Neither the org nor the store is read off the
 *      request — the nonce resolves to a row, and that row says which workspace and which store.
 *      It is burned on read, so a replayed callback finds nothing.
 *   2. **The code lives 30 seconds.** It is exchanged inline, never queued. A background job here
 *      would be a background job that always arrives too late.
 *   3. **It ends in a redirect, not JSON.** A human's browser is what lands here, so every
 *      outcome goes back to the Integrations page with a status in the query string.
 *
 * This route is deliberately NOT capability-gated. The caller is IdeaSoft's redirect, arriving in
 * a browser that may not even carry our session cookie; the authorization already happened when
 * an `manage_integrations` holder started the connect and produced the nonce.
 */

function back(status: string, detail?: string): NextResponse {
  const url = new URL("/dashboard/settings/integrations", getBaseUrl());
  url.searchParams.set("ideasoft", status);
  if (detail) url.searchParams.set("detail", detail.slice(0, 160));
  return NextResponse.redirect(url.toString());
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  const error = params.get("error");

  // The customer pressed "reject", or the store refused before we were involved.
  if (error) {
    console.warn("[COMMERCE][IDEASOFT][CALLBACK][DENIED]", { error });
    if (state) {
      const pending = await consumeOauthState(state);
      if (pending) await markError(pending.id, `Authorization was not granted (${error}).`, true);
    }
    return back("denied", error === "access_denied" ? "The authorization was declined." : error);
  }

  if (!state || !code) return back("error", "The store sent an incomplete response.");

  const pending = await consumeOauthState(state);
  if (!pending) {
    // Either a replay, an expired nonce, or a connect that was restarted in another tab.
    console.warn("[COMMERCE][IDEASOFT][CALLBACK][UNKNOWN_STATE]");
    return back("expired", "That approval link is no longer valid. Start the connection again.");
  }

  const exchanged = await exchangeAuthorizationCode({
    storeBaseUrl: pending.storeBaseUrl,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    code,
  });

  if (!exchanged.ok) {
    console.warn("[COMMERCE][IDEASOFT][CALLBACK][EXCHANGE_FAILED]", {
      connection_id: pending.id,
      reason: exchanged.reason,
    });
    await markError(pending.id, `Token exchange failed: ${exchanged.reason}`, Boolean(exchanged.needsReauth));
    return back("error", explain(exchanged.reason));
  }

  if (!(await saveTokens(pending.id, exchanged.tokens))) {
    return back("error", "Connected, but the credentials could not be stored. Try again.");
  }

  /**
   * Prove it before claiming it.
   *
   * A token exchange succeeding says the grant is real; it says nothing about whether the API app
   * was given catalogue permission. Without this read, a customer would see "Connected" and then
   * watch their AI fail every product question — with the failure looking like our bug.
   */
  try {
    const verified = await readerFor({
      id: pending.id,
      provider: "ideasoft",
      storeBaseUrl: pending.storeBaseUrl,
    }).verify();

    if (!verified.ok) {
      await markError(pending.id, verified.reason);
      console.warn("[COMMERCE][IDEASOFT][CALLBACK][VERIFY_FAILED]", {
        connection_id: pending.id,
        org_id: pending.orgId,
      });
      return back("unverified", verified.reason);
    }
    await markVerified(pending.id);
  } catch {
    // The tokens are stored and valid; only the proof failed. Leave the connection usable and let
    // the page's own health check say more — refusing here would throw away a working grant.
    console.warn("[COMMERCE][IDEASOFT][CALLBACK][VERIFY_ERROR]", { connection_id: pending.id });
  }

  console.info("[COMMERCE][IDEASOFT][CONNECTED]", { org_id: pending.orgId, connection_id: pending.id });
  return back("connected");
}

/** Turn an OAuth error code into something a shop owner can act on. */
function explain(reason: string): string {
  switch (reason) {
    case "redirect_uri_mismatch":
      return "The redirect URL in your IdeaSoft API settings does not match ours exactly. Copy it again.";
    case "invalid_client":
      return "The client ID or secret is wrong. Copy them again from Entegrasyonlar → API.";
    case "invalid_grant":
      return "The approval expired before it reached us. Start the connection again.";
    case "timeout":
    case "network_error":
      return "Your store did not answer in time. Check the address and try again.";
    default:
      return "The store rejected the connection. Check the API settings and try again.";
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getInstagramConfig, isInstagramOAuthConfigured } from "@/lib/instagram/config";
import { verifyOAuthState } from "@/lib/instagram/state";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramAccount,
} from "@/lib/instagram/client";
import { upsertConnection } from "@/lib/instagram/connections";

export const dynamic = "force-dynamic";

/**
 * GET /api/instagram/oauth/callback — Meta redirects here with `code` + `state`.
 * Verifies CSRF state, re-resolves the org from the session (must match the
 * state's org), exchanges code → long-lived token, fetches the account, and
 * persists an encrypted per-org connection. No business logic beyond connect.
 */
export async function GET(req: NextRequest) {
  const dash = new URL("/dashboard/instagram", req.nextUrl.origin);
  const fail = (reason: string) => {
    dash.searchParams.set("error", reason);
    return NextResponse.redirect(dash);
  };

  if (!isInstagramOAuthConfigured()) return fail("not_configured");

  const url = req.nextUrl;
  if (url.searchParams.get("error")) return fail("denied"); // user declined at Meta
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("missing_params");

  const { appSecret } = getInstagramConfig();
  const stateResult = verifyOAuthState(state, appSecret);
  if (!stateResult.ok) return fail(`bad_state_${stateResult.reason}`);

  // Re-resolve org from the session and require it to match the signed state.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/dashboard/instagram", url.origin));

  let sessionOrgId: string | null = null;
  try {
    sessionOrgId = await getActiveOrgId();
  } catch {
    sessionOrgId = null;
  }
  if (!sessionOrgId || sessionOrgId !== stateResult.orgId) return fail("org_mismatch");

  try {
    const short = await exchangeCodeForToken(code);
    const long = await exchangeForLongLivedToken(short.accessToken);
    const account = await fetchInstagramAccount(long.accessToken);

    const expiresAt = long.expiresInSec
      ? new Date(Date.now() + long.expiresInSec * 1000).toISOString()
      : null;
    const scopes = getInstagramConfig().scopes.split(",").map((s) => s.trim()).filter(Boolean);

    const saved = await upsertConnection({
      orgId: sessionOrgId,
      igUserId: account.id,
      username: account.username ?? null,
      accountType: account.accountType ?? null,
      accessToken: long.accessToken,
      tokenExpiresAt: expiresAt,
      scopes,
      connectedBy: user.id,
    });
    if (!saved.ok) {
      console.error("[INSTAGRAM][OAUTH][PERSIST][FAILED]", { orgId: sessionOrgId, error: saved.error });
      return fail("persist_failed");
    }

    console.info("[INSTAGRAM][OAUTH][CONNECTED]", { orgId: sessionOrgId, igUserId: account.id });
    dash.searchParams.set("connected", "1");
    return NextResponse.redirect(dash);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[INSTAGRAM][OAUTH][EXCHANGE][FAILED]", { orgId: sessionOrgId, error: msg });
    return fail("exchange_failed");
  }
}

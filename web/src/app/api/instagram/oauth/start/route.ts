import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { buildAuthorizeUrl, getInstagramConfig, isInstagramOAuthConfigured } from "@/lib/instagram/config";
import { createOAuthState } from "@/lib/instagram/state";

export const dynamic = "force-dynamic";

/**
 * GET /api/instagram/oauth/start — begin the Instagram Business Login connect
 * flow. Session-authed; binds the flow to the caller's org via signed state,
 * then redirects to Meta's authorize dialog.
 */
export async function GET(req: NextRequest) {
  const dash = new URL("/dashboard/instagram", req.nextUrl.origin);

  if (!isInstagramOAuthConfigured()) {
    dash.searchParams.set("error", "not_configured");
    return NextResponse.redirect(dash);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/dashboard/instagram", req.nextUrl.origin));
  }

  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    orgId = null;
  }
  if (!orgId) {
    dash.searchParams.set("error", "no_org");
    return NextResponse.redirect(dash);
  }

  const { appSecret } = getInstagramConfig();
  const state = createOAuthState(orgId, appSecret);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}

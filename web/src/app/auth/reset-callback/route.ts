import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

/**
 * Password-recovery callback (R-011).
 *
 * Supabase's recovery email links here (see `requestPasswordResetAction`). We
 * exchange the recovery `code` for a session (which sets the auth cookies — only
 * possible in a route handler / server action, NOT during RSC render) and then
 * forward the now-authenticated user to `/reset-password` to choose a new password.
 *
 * Deliberately separate from the shared signup `/auth/callback` so the signup
 * critical path carries zero regression risk from the reset flow.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const baseUrl = getBaseUrl();

  if (!code) {
    // No code (expired/invalid link or direct hit) — send back to request a new one.
    return NextResponse.redirect(
      new URL("/forgot-password?error=invalid_link", baseUrl)
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[reset-callback] Code exchange failed:", error.message);
    return NextResponse.redirect(
      new URL("/forgot-password?error=expired_link", baseUrl)
    );
  }

  return NextResponse.redirect(new URL("/reset-password", baseUrl));
}

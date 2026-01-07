import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const email = requestUrl.searchParams.get("email");

  // Use proper base URL instead of request origin (prevents localhost redirects on mobile)
  const baseUrl = getBaseUrl();

  if (code || token_hash) {
    const supabase = await createSupabaseServerClient();

    if (code) {
      // Exchange code for session (PKCE flow)
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(`/verify-email?error=${encodeURIComponent(error.message)}${email ? `&email=${encodeURIComponent(email)}` : ""}`, baseUrl)
        );
      }

      // After successful code exchange, fetch user again to get latest confirmation status
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        return NextResponse.redirect(new URL("/login", baseUrl));
      }

      // Check if email is confirmed
      const emailConfirmed = (currentUser as any).email_confirmed_at || (currentUser as any).confirmed_at;

      // If email is confirmed, redirect to dashboard
      if (emailConfirmed) {
        return NextResponse.redirect(new URL("/dashboard", baseUrl));
      }

      // If email not confirmed, redirect to verify-email
      const userEmail = currentUser.email || email || "";
      return NextResponse.redirect(
        new URL(`/verify-email${userEmail ? `?email=${encodeURIComponent(userEmail)}` : ""}`, baseUrl)
      );
    } else if (token_hash && type) {
      // Verify OTP token (legacy flow)
      if (!email) {
        return NextResponse.redirect(
          new URL("/verify-email?error=Missing email", baseUrl)
        );
      }

      const { error } = await supabase.auth.verifyOtp({
        email,
        token: token_hash,
        type: type as any,
      });

      if (error) {
        return NextResponse.redirect(
          new URL(`/verify-email?error=${encodeURIComponent(error.message)}&email=${encodeURIComponent(email)}`, baseUrl)
        );
      }

      // Redirect to verify-email page to complete setup
      return NextResponse.redirect(
        new URL(`/verify-email?email=${encodeURIComponent(email)}`, baseUrl)
      );
    }
  }

  // No code or token_hash provided
  return NextResponse.redirect(new URL("/login", baseUrl));
}


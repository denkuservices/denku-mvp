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

      // After successful code exchange, check if user needs to set password
      // If email is provided, redirect to verify-email to complete setup
      if (email) {
        return NextResponse.redirect(
          new URL(`/verify-email?email=${encodeURIComponent(email)}`, baseUrl)
        );
      }

      // If user is already fully set up, go to dashboard
      if (data.session) {
        return NextResponse.redirect(new URL("/dashboard", baseUrl));
      }

      // Fallback: redirect to verify-email (user may need to complete setup)
      return NextResponse.redirect(new URL("/verify-email", baseUrl));
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


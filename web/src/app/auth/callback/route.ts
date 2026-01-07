import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (code || token_hash) {
    const supabase = await createSupabaseServerClient();

    if (code) {
      // Exchange code for session
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(`/verify-email?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
        );
      }
    } else if (token_hash && type) {
      // Verify OTP token
      const email = requestUrl.searchParams.get("email");
      if (!email) {
        return NextResponse.redirect(
          new URL("/verify-email?error=Missing email", requestUrl.origin)
        );
      }

      const { error } = await supabase.auth.verifyOtp({
        email,
        token: token_hash,
        type: type as any,
      });

      if (error) {
        return NextResponse.redirect(
          new URL(`/verify-email?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
        );
      }
    }

    // Redirect to verify-email page to complete setup
    const email = requestUrl.searchParams.get("email");
    if (email) {
      return NextResponse.redirect(
        new URL(`/verify-email?email=${encodeURIComponent(email)}`, requestUrl.origin)
      );
    }

    return NextResponse.redirect(new URL("/dashboard", requestUrl.origin));
  }

  return NextResponse.redirect(new URL("/login", requestUrl.origin));
}


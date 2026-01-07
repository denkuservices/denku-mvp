import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function isAuthorizedBasic(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const base64 = authHeader.split(" ")[1] ?? "";
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const [user, pass] = decoded.split(":");

  return user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS;
}

/**
 * Create Supabase client for middleware context.
 * Uses request/response cookies for session management.
 */
function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1) Admin koruması (Basic Auth) — aynen devam
  // Exception: /api/admin/analytics/export uses Supabase session auth, not Basic Auth
  const isAnalyticsExport = pathname === "/api/admin/analytics/export";
  if (isAnalyticsExport) {
    // Skip Basic Auth for analytics export - it uses Supabase session auth
    return response;
  }

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (isAdminArea) {
    if (isAuthorizedBasic(request)) return response;

    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Admin Area"',
      },
    });
  }

  // 2) App koruması (Supabase session + email verification) — /dashboard
  const isDashboard = pathname.startsWith("/dashboard");
  if (isDashboard) {
    try {
      const supabase = createSupabaseMiddlewareClient(request, response);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      // Debug headers (temporary for verification)
      const userId = user?.id || "none";
      const userEmail = user?.email || "";
      let confirmedStatus: "true" | "false" | "unknown" = "unknown";

      if (!user) {
        // No user → redirect to login
        response.headers.set("x-auth-user", "none");
        response.headers.set("x-auth-confirmed", "false");
        response.headers.set("x-auth-email", "");

        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }

      // Check email confirmation status
      const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;
      confirmedStatus = emailConfirmed ? "true" : "false";

      // Set debug headers
      response.headers.set("x-auth-user", userId);
      response.headers.set("x-auth-confirmed", confirmedStatus);
      response.headers.set("x-auth-email", userEmail);

      if (!emailConfirmed) {
        // Email not confirmed → redirect to verify-email
        const url = request.nextUrl.clone();
        url.pathname = "/verify-email";
        if (userEmail) {
          url.searchParams.set("email", userEmail);
        }
        return NextResponse.redirect(url);
      }

      // User authenticated and email confirmed → allow access
      return response;
    } catch (err) {
      // Error creating Supabase client or fetching user
      console.error("[middleware] Auth check error:", err);
      response.headers.set("x-auth-user", "error");
      response.headers.set("x-auth-confirmed", "unknown");
      response.headers.set("x-auth-email", "");

      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
  ],
};

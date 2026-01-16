import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

      // User authenticated and email confirmed → check plan active status
      // Get org_id
      const { data: profiles } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("auth_user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (profiles && profiles.length > 0 && profiles[0].org_id) {
        const orgId = profiles[0].org_id;
        
        // Allowlist: Billing page is accessible even if plan not active
        // This allows users to purchase a plan during the onboarding flow
        const isBillingPath = pathname === "/dashboard/settings/workspace/billing" || pathname.startsWith("/dashboard/settings/workspace/billing/");
        
        if (isBillingPath) {
          // Allow access to billing page even if plan not active
          // This enables the "Choose a plan" flow during onboarding
          return response;
        }
        
        // Check plan active status for all other /dashboard paths
        const { data: planLimits } = await supabaseAdmin
          .from("org_plan_limits")
          .select("plan_code")
          .eq("org_id", orgId)
          .maybeSingle<{ plan_code: string | null }>();

        const planActive = !!planLimits?.plan_code;
        if (!planActive) {
          // Plan not active → redirect to onboarding
          // Preserve query params if present
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          // Keep existing query params (like return_to) in case user was redirected from billing
          return NextResponse.redirect(url);
        }
      } else {
        // No org yet → redirect to onboarding
        // Exception: allow billing page for users who might be creating org during signup
        const isBillingPath = pathname === "/dashboard/settings/workspace/billing" || pathname.startsWith("/dashboard/settings/workspace/billing/");
        if (!isBillingPath) {
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          return NextResponse.redirect(url);
        }
      }

      // User authenticated, email confirmed, and plan active → allow access
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

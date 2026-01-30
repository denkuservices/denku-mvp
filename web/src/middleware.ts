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

  const isProduction = process.env.NODE_ENV === "production";

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        // CRITICAL: Ensure cookies work on localhost (http://)
        // Secure flag must be false on localhost, true only in production (HTTPS)
        const cookieOptions: CookieOptions = {
          ...options,
          secure: isProduction, // false on localhost, true in production
          sameSite: options.sameSite ?? "lax", // Default to lax if not specified
          path: options.path ?? "/", // Default to root path
        };
        response.cookies.set({ name, value, ...cookieOptions });
      },
      remove(name: string, options: CookieOptions) {
        // Ensure cookie removal also respects secure flag for localhost
        const cookieOptions: CookieOptions = {
          ...options,
          secure: isProduction,
          sameSite: options.sameSite ?? "lax",
          path: options.path ?? "/",
        };
        response.cookies.set({ name, value: "", ...cookieOptions, maxAge: 0 });
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

  // 2) Login page handling
  // NOTE: /login is in (auth) route group and uses (auth)/layout.tsx (NOT (app)/layout.tsx with HorizonShell)
  // /login is NOT in the middleware matcher, so this block won't run unless explicitly matched
  // However, we check here as a guard if /login ever enters middleware context
  const isLogin = pathname === "/login";
  if (isLogin) {
    try {
      const supabase = createSupabaseMiddlewareClient(request, response);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      if (user) {
        // User already logged in - redirect to dashboard
        // This ensures /login page itself doesn't need to handle this redirect
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    } catch (err) {
      // If auth check fails, allow access to login page (user might not have session, which is fine)
      console.error("[middleware] Login page auth check error:", err);
    }
    // Allow /login through - it uses (auth)/layout.tsx, NOT (app)/layout.tsx
    return response;
  }

  // 2.5) Onboarding route - never apply plan gating, allow through after basic auth check
  const isOnboarding = pathname.startsWith("/onboarding");
  if (isOnboarding) {
    // Onboarding page handles its own redirects based on planCode
    // Middleware should never redirect /onboarding to /dashboard
    // Just do basic auth check and allow through
    try {
      const supabase = createSupabaseMiddlewareClient(request, response);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      
      // If no user, onboarding page will handle redirect to login
      // If user exists, allow through - onboarding page will check planCode and redirect if needed
      return response;
    } catch (err) {
      // If auth check fails, still allow through - onboarding page will handle it
      console.error("[middleware] Onboarding route auth check error:", err);
      return response;
    }
  }

  // 3) App koruması (Supabase session + email verification) — /dashboard
  const isDashboard = pathname.startsWith("/dashboard");
  if (isDashboard) {
    // Debug log for phone-lines route
    if (pathname === "/dashboard/phone-lines") {
      console.log("[mw] /dashboard/phone-lines hit");
    }
    
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
        if (pathname === "/dashboard/phone-lines") {
          console.log("[mw] /dashboard/phone-lines -> redirect to /login (no user)");
        }
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
        if (pathname === "/dashboard/phone-lines") {
          console.log("[mw] /dashboard/phone-lines -> redirect to /verify-email (email not confirmed)");
        }
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
        
        // Check onboarding_step for all other /dashboard paths
        // Dashboard allowed ONLY when onboarding_step >= 6 (Live)
        // Plan status alone does NOT grant dashboard access - must complete activation
        const { data: settings, error: settingsErr } = await supabaseAdmin
          .from("organization_settings")
          .select("onboarding_step")
          .eq("org_id", orgId)
          .maybeSingle<{ onboarding_step: number | null }>();

        let onboardingStep = 0;
        if (settingsErr) {
          // Error fetching settings - FAIL OPEN: allow /dashboard to prevent ping-pong loops
          console.error("[middleware] Onboarding step check error (failing open to prevent loops):", settingsErr.message);
          if (pathname === "/dashboard/phone-lines") {
            console.log("[mw] /dashboard/phone-lines -> allowed (settings error, fail open)");
          }
          return response;
        } else {
          // No error - get onboarding_step (default to 0 if null)
          onboardingStep = settings?.onboarding_step ?? 0;
        }

        // Only allow dashboard when onboarding_step >= 6 (Live)
        // Do NOT check plan status - plan can be active but activation incomplete
        if (onboardingStep < 6) {
          // Onboarding not complete → redirect to onboarding
          if (pathname === "/dashboard/phone-lines") {
            console.log("[mw] /dashboard/phone-lines -> redirect to /onboarding", {
              orgId,
              onboarding_step: onboardingStep,
            });
          }
          // Preserve query params if present
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          // Keep existing query params (like return_to) in case user was redirected from billing
          return NextResponse.redirect(url);
        } else {
          if (pathname === "/dashboard/phone-lines") {
            console.log("[mw] /dashboard/phone-lines -> allowed", {
              orgId,
              onboarding_step: onboardingStep,
            });
          }
        }
      } else {
        // No org yet → redirect to onboarding
        // Exception: allow billing page for users who might be creating org during signup
        const isBillingPath = pathname === "/dashboard/settings/workspace/billing" || pathname.startsWith("/dashboard/settings/workspace/billing/");
        if (!isBillingPath) {
          if (pathname === "/dashboard/phone-lines") {
            console.log("[mw] /dashboard/phone-lines -> redirect to /onboarding (no org)");
          }
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          return NextResponse.redirect(url);
        }
      }

      // User authenticated, email confirmed, and onboarding complete (step >= 6) → allow access
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
  // NOTE: /login is intentionally EXCLUDED from matcher
  // /login uses (auth)/layout.tsx and should NEVER enter this middleware
  // Only /dashboard and /onboarding routes go through app-protection middleware
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
    "/onboarding/:path*",
  ],
};

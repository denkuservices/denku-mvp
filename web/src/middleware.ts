import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  resolveSupabaseAnonCredentials,
  authCookieOptions,
  authCookieRemovalOptions,
} from "@/lib/supabase/cookiePolicy";
import { platformUxEnabled } from "@/lib/platform/flags";
import { platformRedirectTarget, splitRedirectTarget } from "@/lib/platform/routeRedirects";
import createIntlMiddleware from "next-intl/middleware";
import { routing, localeForCountry, LOCALE_CHOICE_COOKIE } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

/**
 * Paths that are NOT localised. Everything else under the site root belongs to the
 * marketing tree and goes through next-intl.
 *
 * Inverted deliberately: enumerating the marketing routes would mean editing this
 * list every time a page is added, and a forgotten entry would 404 rather than
 * fail loudly.
 */
const UNLOCALISED = [
  "/api", "/admin", "/dashboard", "/onboarding",
  // The Web Chat widget document. It is a route handler serving HTML into an iframe on a
  // customer's site; a locale prefix would 404 it and take their chat down.
  "/embed",
  "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password",
  "/auth", "/_next", "/horizon",
];

function isUnlocalised(pathname: string): boolean {
  if (UNLOCALISED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Files (favicon.ico, robots.txt, sitemap.xml, og.jpg …)
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

/**
 * `/tr/login` -> `/login`. Returns the unprefixed path when a locale prefix has been
 * put in front of a route that is not localised, otherwise null.
 */
function stripLocaleFromUnlocalised(pathname: string): string | null {
  for (const locale of routing.locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix || !pathname.startsWith(`${prefix}/`)) continue;
    const rest = pathname.slice(prefix.length);
    if (isUnlocalised(rest)) return rest;
  }
  return null;
}

// Crawlers are never geo-redirected: sending Googlebot (which crawls from the US)
// somewhere other than the canonical English page pollutes the index.
const BOT_RE = /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview/i;

/**
 * First-visit language pick, from the visitor's country.
 *
 * Owner's rule: serve the country's language if we have it, otherwise English.
 * Only fires when the visitor has not CHOSEN a language and the path names none, so a
 * manual switch is never overridden on the next click.
 *
 * The choice is `DENKU_LOCALE`, not `NEXT_LOCALE`. That distinction is the whole fix:
 * next-intl writes `NEXT_LOCALE` on any locale-resolving navigation, including a first
 * visit that merely landed on `/en` — the canonical English URL, the one in the sitemap
 * and the one Google links to. Treating it as a choice meant a visitor in Turkey who
 * arrived from an English search result was pinned to English forever, even typing the
 * bare domain afterwards (observed 2026-09-03, on the owner's own browser).
 *
 * The country comes from the edge header Vercel populates; locally it is absent
 * and everyone simply gets English.
 */
function geoRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (request.cookies.has(LOCALE_CHOICE_COOKIE)) return null;
  if (BOT_RE.test(request.headers.get("user-agent") ?? "")) return null;

  const alreadyPrefixed = routing.locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (alreadyPrefixed) return null;

  const country =
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry");
  const locale = localeForCountry(country);
  if (locale === routing.defaultLocale) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const res = NextResponse.redirect(url);
  // Remember the pick so this runs once per visitor, not on every navigation. This is
  // NEXT_LOCALE, not the choice cookie: the visitor has not chosen anything, we guessed
  // from their country, and a guess must stay overridable by the switcher.
  res.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

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
 *
 * Cookie attributes come from `lib/supabase/cookiePolicy.ts` — the same policy the
 * Server Component client uses — so the session cookie this refreshes stays readable
 * by the rest of the app.
 */
function createSupabaseMiddlewareClient(request: NextRequest, response: NextResponse) {
  const { url, anonKey } = resolveSupabaseAnonCredentials();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        response.cookies.set({ name, value, ...authCookieOptions(options) });
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: "", ...authCookieRemovalOptions(options) });
      },
    },
  });
}

export async function middleware(request: NextRequest) {
  /*
   * An auth code that landed somewhere other than the callback.
   *
   * Supabase decides where a confirmation email points from the project's Site URL when the call
   * that sent it did not name a redirect. That put `?code=…` on the site ROOT, where nothing
   * consumes it — the customer clicked their link, arrived at the homepage, and was still signed
   * out with no clue why.
   *
   * `sendCodeAction` names the redirect now, but this stays for two reasons: links already sent
   * still point at the root, and the sending side is configuration that can drift again. A code
   * is only ever meaningful to `/auth/callback`, so forwarding it there is always the right
   * answer and never changes anything else.
   */
  const authCode = request.nextUrl.searchParams.get("code");
  if (authCode && request.nextUrl.pathname !== "/auth/callback") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  // Auth lives OUTSIDE the [locale] tree, so /tr/login has no route. Links no
  // longer generate one, but a typed URL or an old bookmark still could — strip
  // the prefix rather than 404. The language survives in the NEXT_LOCALE cookie,
  // which is what the auth layout reads anyway.
  const localised = stripLocaleFromUnlocalised(request.nextUrl.pathname);
  if (localised) {
    const url = request.nextUrl.clone();
    url.pathname = localised;
    return NextResponse.redirect(url);
  }

  // Marketing tree: locale routing only. The app-protection logic below never
  // applied to these paths (they were not in the matcher before), so nothing about
  // dashboard gating or admin auth changes by widening the matcher for locales.
  if (!isUnlocalised(request.nextUrl.pathname)) {
    return geoRedirect(request) ?? intlMiddleware(request);
  }

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

  // Sprint 5: when the platform IA is enabled, redirect legacy voice-first routes to their
  // channel-agnostic equivalents (preserving deep links). Flag OFF → no redirect, legacy
  // routes serve as before. Runs before auth so the target path is then auth-gated normally.
  if (isDashboard && platformUxEnabled()) {
    const target = platformRedirectTarget(pathname);
    if (target && target !== pathname) {
      const url = request.nextUrl.clone();
      // A target may carry its own query (e.g. `/dashboard?tab=analytics`). Merge it OVER the
      // incoming params rather than replacing them, so deep links keep their filters — a shared
      // `/dashboard/analytics?range=30d` lands on the analytics tab still showing 30 days.
      const { path, query } = splitRedirectTarget(target);
      url.pathname = path;
      for (const [k, v] of query) url.searchParams.set(k, v);
      return NextResponse.redirect(url);
    }
  }

  if (isDashboard) {
    try {
      const supabase = createSupabaseMiddlewareClient(request, response);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      const userEmail = user?.email || "";

      if (!user) {
        // No user → redirect to login
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        return NextResponse.redirect(url);
      }

      // Check email confirmation status
      const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;

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
          return response;
        } else {
          // No error - get onboarding_step (default to 0 if null)
          onboardingStep = settings?.onboarding_step ?? 0;
        }

        // Only allow dashboard when onboarding_step >= 6 (Live)
        // Do NOT check plan status - plan can be active but activation incomplete
        if (onboardingStep < 6) {
          // Onboarding not complete → redirect to onboarding
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

      // User authenticated, email confirmed, and onboarding complete (step >= 6) → allow access
      return response;
    } catch (err) {
      // Error creating Supabase client or fetching user
      console.error("[middleware] Auth check error:", err);

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
    // Marketing tree, for locale routing. Kept deliberately broad and simple —
    // a clever matcher regex silently failed to fire here, so the filtering is
    // done in code by `isUnlocalised`, which is testable and obvious.
    "/",
    "/((?!_next|api).*)",
  ],
};

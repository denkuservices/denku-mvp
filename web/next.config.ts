import type { NextConfig } from "next";
import path from "path";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";

// Points next-intl at src/i18n/request.ts (non-default location).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/**
 * Security headers (R-056).
 *
 * CSP ships in REPORT-ONLY first (per the sprint risk note): it never blocks, only
 * reports violations to /api/csp-report, so we can watch real traffic and tune the
 * allowlist before switching to an enforcing `Content-Security-Policy`. The allowlist
 * is built from the origins the app actually loads (verified 2026-07-08): Google Fonts,
 * Spline (prod.spline.design), Vapi + Daily (WebRTC transport), Supabase (REST + wss).
 * Stripe is client-unused today (server SDK only; checkout/portal are top-level
 * redirects) but included defensively. The remaining headers are safe to ENFORCE now.
 *
 * Sprint 6 (L3): the report-only ↔ enforcing switch is now driven by `CSP_MODE` (default
 * "report"), so an operator flips to enforcing with **one env var + redeploy** — no code
 * edit at go-live. Only flip to `enforce` after reviewing /api/csp-report for real
 * violations. The policy string is identical in both modes; only the header key changes.
 */
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  // Supabase Storage serves the signed URLs for customer photos and voice notes in the Inbox
  // (Sprint 8 perception). `img-src` already allows `https:`; audio and video need saying.
  "media-src 'self' blob: https://*.daily.co https://*.supabase.co",
  "worker-src 'self' blob:",
  "connect-src 'self' https://api.vapi.ai wss://*.vapi.ai https://*.daily.co wss://*.daily.co https://*.supabase.co wss://*.supabase.co https://prod.spline.design https://*.spline.design https://api.stripe.com",
  "frame-src 'self' https://*.daily.co https://js.stripe.com https://checkout.stripe.com",
  "report-uri /api/csp-report",
].join("; ");

// CSP header key by mode. Default is report-only (never blocks) unless CSP_MODE=enforce.
const cspEnforcing = (process.env.CSP_MODE ?? "").toLowerCase().trim() === "enforce";
const cspHeaderKey = cspEnforcing ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";

const securityHeaders = [
  { key: cspHeaderKey, value: contentSecurityPolicyReportOnly },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

/**
 * The Web Chat widget document is framed by customer websites on purpose, so it gets everything
 * above EXCEPT the two headers that forbid framing and except the CSP — which the embed route
 * sets itself, per connection, from the customer's own allowlist.
 */
const embedHeaders = securityHeaders.filter(
  (h) => h.key !== "X-Frame-Options" && h.key !== cspHeaderKey
);

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  /**
   * Client-side Router Cache tuning (perf, 2026-08-31).
   *
   * Almost every dashboard page is `force-dynamic`, and Next 16's default `staleTime` for a
   * dynamic segment is 0 — so a page (or an Inbox conversation) you already opened is refetched
   * from the server every time you navigate back to it, and the middleware auth chain is paid
   * again. Holding a visited dynamic route in the client cache for 30s makes back-navigation and
   * re-opening a menu item feel instant without changing what a first visit sees. `static` covers
   * the few cached routes (e.g. the home overview, revalidate=60).
   */
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      /**
       * Everything except the Web Chat widget document.
       *
       * `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` are exactly right for the app
       * and exactly wrong for `/embed/*`, whose entire job is to be framed by the customer's own
       * website. Excluding it here rather than loosening the rule for everyone keeps the app
       * un-framable, and lets the embed route set a `frame-ancestors` built from that specific
       * install's allowlist — a per-customer policy this static list could never express.
       * Next.js emits headers from every matching entry, so the exclusion is a negative lookahead
       * rather than a second entry: two Content-Security-Policy headers would be intersected by
       * the browser and the stricter one would win, silently.
       */
      { source: "/((?!embed/).*)", headers: securityHeaders },
      { source: "/embed/:path*", headers: embedHeaders },
    ];
  },
  async rewrites() {
    return [
      // Map Horizon asset paths
      {
        source: "/img/:path*",
        destination: "/horizon/img/:path*",
      },
      {
        source: "/fonts/:path*",
        destination: "/horizon/fonts/:path*",
      },
      {
        source: "/svg/:path*",
        destination: "/horizon/svg/:path*",
      },
    ];
  },
  webpack: (config) => {
    // Resolve Horizon absolute imports to src/horizon/*
    config.resolve.alias = {
      ...config.resolve.alias,
      'components': path.resolve(__dirname, 'src/horizon/components'),
      'contexts': path.resolve(__dirname, 'src/horizon/contexts'),
      'variables': path.resolve(__dirname, 'src/horizon/variables'),
      'utils': path.resolve(__dirname, 'src/horizon/utils'),
      'routes': path.resolve(__dirname, 'src/horizon/routes'),
      'styles': path.resolve(__dirname, 'src/horizon/styles'),
    };
    return config;
  },
};

export default withNextIntl(withBundleAnalyzer(nextConfig));

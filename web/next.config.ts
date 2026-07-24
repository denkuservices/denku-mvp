import type { NextConfig } from "next";
import path from "path";
import bundleAnalyzer from "@next/bundle-analyzer";
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
  "media-src 'self' blob: https://*.daily.co",
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

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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

export default withBundleAnalyzer(nextConfig);

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * CSP violation collector (R-056). The `Content-Security-Policy-Report-Only` header
 * points its `report-uri` here so we can observe what a future enforcing CSP would
 * block, on real traffic, before switching it on. Intentionally public (browsers post
 * reports unauthenticated), does no DB work, and never throws — it just logs a compact,
 * truncated summary. Returns 204.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    // report-uri sends `{ "csp-report": {...} }`; report-to sends an array of reports.
    const r =
      (body && (body["csp-report"] ?? body.body)) ||
      (Array.isArray(body) ? body[0]?.body : null) ||
      body;

    if (r && typeof r === "object") {
      const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 300) : v ?? null);
      console.warn("[CSP][REPORT_ONLY][VIOLATION]", {
        documentUri: s(r.documentUri ?? r["document-uri"]),
        violatedDirective: s(r.violatedDirective ?? r["violated-directive"] ?? r.effectiveDirective),
        blockedUri: s(r.blockedUri ?? r["blocked-uri"]),
      });
    }
  } catch {
    // never throw from a reporting endpoint
  }
  return new NextResponse(null, { status: 204 });
}

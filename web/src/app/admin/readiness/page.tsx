import { getReadinessReport } from "@/lib/launch/readiness";
import type { CheckStatus } from "@/lib/launch/checks";

export const dynamic = "force-dynamic";

/**
 * Production Readiness Preflight — operator page (Sprint 6, L1 / R-098).
 * Under /admin/* so the middleware Basic-Auth gate protects it. One glance answers
 * "are we safe to take a paying customer?". Self-contained styling (not the customer shell).
 */

const DOT: Record<CheckStatus, string> = {
  pass: "#16a34a",
  warn: "#d97706",
  fail: "#dc2626",
};
const LABEL: Record<CheckStatus, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };

export default async function ReadinessPage() {
  const report = await getReadinessReport();
  const { summary, checks } = report;

  const categories = [...new Set(checks.map((c) => c.category))];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#0a1a2f" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Launch Readiness</h1>
      <p style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>
        Generated {new Date(report.generatedAt).toLocaleString()} · presence/mode only, never secret values.
      </p>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 12, marginBottom: 20,
          background: summary.ready ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${summary.ready ? "#bbf7d0" : "#fecaca"}`,
        }}
      >
        <span style={{ fontSize: 22 }}>{summary.ready ? "✅" : "⛔"}</span>
        <div>
          <div style={{ fontWeight: 700 }}>
            {summary.ready ? "Ready for a paying customer" : "NOT ready — required checks failing"}
          </div>
          <div style={{ fontSize: 13, color: "#475569" }}>
            {summary.counts.pass} pass · {summary.counts.warn} warn · {summary.counts.fail} fail
            {summary.requiredFailures.length ? ` · blocking: ${summary.requiredFailures.join(", ")}` : ""}
          </div>
        </div>
      </div>

      {categories.map((cat) => (
        <section key={cat} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 6 }}>{cat}</h2>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {checks.filter((c) => c.category === cat).map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                  borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
                }}
              >
                <span style={{ marginTop: 3, height: 9, width: 9, borderRadius: 999, background: DOT[c.status], flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {c.label}
                    {c.required ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> · required</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#64748b", wordBreak: "break-word" }}>{c.detail}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: DOT[c.status] }}>{LABEL[c.status]}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
        Follow the ordered activation steps in docs/LAUNCH_RUNBOOK.md. JSON: /api/admin/readiness.
      </p>
    </div>
  );
}

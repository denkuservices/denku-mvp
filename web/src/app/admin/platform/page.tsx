import { notFound } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-admin/access";
import { getPlatformOverview, type UsageTotals, type OrgBucket } from "@/lib/platform-admin/metrics";
import { listAllGrants, type GrantRow } from "@/lib/billing/grants";
import { GrantPanel } from "./_components/GrantPanel";

/**
 * The platform operator's console: what the whole product is doing, and the controls to hand a
 * prospect a trial.
 *
 * Under `/admin` so `middleware.ts` puts HTTP Basic Auth in front of it, and gated again on the
 * signed-in account being on the platform allowlist. It answers with **404, not 403** when the
 * account is wrong — a customer who guesses this URL learns nothing about what is here.
 *
 * Styled self-contained, like `/admin/readiness`: this is an operator surface, not one of the four
 * design systems, and it is outside the localised tree (landmine #22) so the English here is
 * deliberate rather than a missing dictionary entry.
 *
 * The page is honest about its own numbers. `overview.caveats` is rendered, not hidden — a figure
 * whose limits are only in a code comment is a figure somebody will eventually quote.
 */

export const dynamic = "force-dynamic";

const C = {
  ink: "#0a1a2f",
  muted: "#64748b",
  line: "#e2e8f0",
  bg: "#ffffff",
  soft: "#f8fafc",
  good: "#16a34a",
  warn: "#d97706",
  bad: "#dc2626",
  accent: "#2563eb",
};

const BUCKET_LABEL: Record<OrgBucket, string> = {
  customer: "Customers",
  internal: "Denku (internal)",
  trial: "Trials",
};

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function minutes(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} min`;
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, background: C.bg, minWidth: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div> : null}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h2>
      {note ? <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 12px" }}>{note}</p> : <div style={{ height: 12 }} />}
      {children}
    </section>
  );
}

function UsageRow({ label, u, emphasis }: { label: string; u: UsageTotals; emphasis?: boolean }) {
  return (
    <tr style={{ fontWeight: emphasis ? 700 : 400 }}>
      <td style={td}>{label}</td>
      <td style={tdNum}>{u.calls.toLocaleString("en-US")}</td>
      <td style={tdNum}>{minutes(u.exactMinutes)}</td>
      <td style={tdNum}>{minutes(u.billableMinutes)}</td>
      <td style={tdNum}>{usd(u.costUsd)}</td>
    </tr>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: C.muted,
  padding: "8px 10px",
  borderBottom: `1px solid ${C.line}`,
  whiteSpace: "nowrap",
};
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: `1px solid ${C.line}`, fontSize: 13 };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

export default async function PlatformConsolePage() {
  const admin = await getPlatformAdmin();
  // Not `forbidden()`: a 403 tells a signed-in customer that this route exists and that they merely
  // have the wrong account. There is nothing to gain from telling them.
  if (!admin) notFound();

  const overview = await getPlatformOverview();

  /*
   * Every grant, in one query, grouped here.
   *
   * The first version fetched history only for workspaces holding a LIVE grant, which meant a grant
   * disappeared from the panel the instant it was withdrawn — precisely when the operator is
   * looking for confirmation that the withdrawal worked. Fetching per-org instead would be one
   * round trip per workspace, and there are 43.
   */
  const history = new Map<string, GrantRow[]>();
  for (const grant of await listAllGrants()) {
    const list = history.get(grant.org_id) ?? [];
    if (list.length < 10) list.push(grant);
    history.set(grant.org_id, list);
  }

  const m = overview.members;
  const v = overview.voice;
  const cost = overview.cost;
  const rev = overview.revenue;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: C.ink }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Platform Console</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: "4px 0 0" }}>
            Every workspace, every minute, every dollar. Generated {new Date(overview.generatedAt).toLocaleString()}.
          </p>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          signed in as <strong style={{ color: C.ink }}>{admin.email}</strong>
        </div>
      </header>

      <Section title="Members">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Card label="Workspaces" value={m.workspaces.toLocaleString("en-US")} sub={`${m.newWorkspaces30d} created in 30 days`} />
          <Card
            label="Members"
            value={m.members.toLocaleString("en-US")}
            sub={m.authAccounts !== null ? `${m.authAccounts} auth accounts` : "auth count unavailable"}
          />
          <Card label="Paying" value={m.payingWorkspaces.toLocaleString("en-US")} sub="voice plan or chat tier" />
          <Card label="On trial" value={m.trialWorkspaces.toLocaleString("en-US")} sub="live grant, no paid voice plan" />
          <Card label="Paused" value={m.pausedWorkspaces.toLocaleString("en-US")} sub="not answering right now" />
        </div>
      </Section>

      <Section
        title="Voice minutes and Vapi cost"
        note="Billable minutes round each call up to a whole minute — the same rule the invoice uses. Cost is what Vapi reported for the call itself."
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={th}>All time</th>
                <th style={thNum}>Calls</th>
                <th style={thNum}>Exact</th>
                <th style={thNum}>Billable</th>
                <th style={thNum}>Vapi cost</th>
              </tr>
            </thead>
            <tbody>
              {(["customer", "trial", "internal"] as OrgBucket[]).map((b) => (
                <UsageRow key={b} label={BUCKET_LABEL[b]} u={v.allTime[b]} />
              ))}
              <UsageRow label="Total" u={v.allTime.total} emphasis />
              <tr>
                <td style={{ ...td, color: C.muted, paddingLeft: 24 }}>
                  ↳ landing-page assistant (subset of Denku internal)
                </td>
                <td style={tdNum}>{v.landingAgent.allTime.calls.toLocaleString("en-US")}</td>
                <td style={tdNum}>{minutes(v.landingAgent.allTime.exactMinutes)}</td>
                <td style={tdNum}>{minutes(v.landingAgent.allTime.billableMinutes)}</td>
                <td style={tdNum}>{usd(v.landingAgent.allTime.costUsd)}</td>
              </tr>
            </tbody>
            <thead>
              <tr>
                <th style={{ ...th, paddingTop: 18 }}>This month</th>
                <th style={{ ...thNum, paddingTop: 18 }}>Calls</th>
                <th style={{ ...thNum, paddingTop: 18 }}>Exact</th>
                <th style={{ ...thNum, paddingTop: 18 }}>Billable</th>
                <th style={{ ...thNum, paddingTop: 18 }}>Vapi cost</th>
              </tr>
            </thead>
            <tbody>
              {(["customer", "trial", "internal"] as OrgBucket[]).map((b) => (
                <UsageRow key={b} label={BUCKET_LABEL[b]} u={v.thisMonth[b]} />
              ))}
              <UsageRow label="Total" u={v.thisMonth.total} emphasis />
              <tr>
                <td style={{ ...td, color: C.muted, paddingLeft: 24 }}>↳ landing-page assistant</td>
                <td style={tdNum}>{v.landingAgent.thisMonth.calls.toLocaleString("en-US")}</td>
                <td style={tdNum}>{minutes(v.landingAgent.thisMonth.exactMinutes)}</td>
                <td style={tdNum}>{minutes(v.landingAgent.thisMonth.billableMinutes)}</td>
                <td style={tdNum}>{usd(v.landingAgent.thisMonth.costUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What it costs Denku" note="Observed figures and estimates are kept apart on purpose.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Card label="Vapi calls · all time" value={usd(cost.vapiCallsAllTimeUsd)} sub="observed, per call" />
          <Card label="Vapi calls · this month" value={usd(cost.vapiCallsThisMonthUsd)} sub="observed, per call" />
          <Card
            label="Number rental · monthly"
            value={`≈ ${usd(cost.numberRental.estimatedMonthlyUsd)}`}
            sub={`ESTIMATE · ${cost.numberRental.activeLines} lines × $${cost.numberRental.monthlyRateUsd}`}
          />
          <Card
            label="Chat LLM cost"
            value="not measured"
            sub={`${cost.chatMessagesAllTime.toLocaleString("en-US")} messages, no cost recorded`}
          />
        </div>
      </Section>

      <Section title={`Revenue vs cost · ${rev.month}`} note={`Covers ${rev.orgsCovered} workspace(s) with a voice plan.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <Card label="Estimated revenue" value={usd(rev.estimatedRevenueUsd)} sub="plan fees + overage" />
          <Card label="Cost of goods" value={usd(rev.cogsUsd)} sub="Vapi, this month" />
          <Card label="Margin" value={usd(rev.marginUsd)} sub={`${rev.marginPct}%`} />
          <Card
            label="Verdict"
            value={rev.verdict.toUpperCase()}
            sub={rev.verdict === "ok" ? "healthy" : rev.verdict === "thin" ? "below 25%" : "losing money"}
          />
        </div>
      </Section>

      <Section title="Workspaces" note="Sorted by lifetime Vapi cost. Use the panel on a row to grant a trial.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}>Workspace</th>
                <th style={th}>Owner</th>
                <th style={th}>Type</th>
                <th style={th}>Plan</th>
                <th style={thNum}>Lines</th>
                <th style={thNum}>Min (all)</th>
                <th style={thNum}>Cost (all)</th>
                <th style={th}>Status</th>
                <th style={th}>Grants</th>
              </tr>
            </thead>
            <tbody>
              {overview.orgs.map((o) => {
                const hasGrant = o.grants.voiceMinutes > 0 || o.grants.chatSlots > 0 || o.grants.phoneNumbers > 0;
                return (
                  <tr key={o.orgId}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{o.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: "ui-monospace, monospace" }}>{o.orgId}</div>
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>{o.ownerEmail ?? "—"}</td>
                    <td style={{ ...td, fontSize: 12 }}>{BUCKET_LABEL[o.bucket]}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {o.voicePlanCode ?? "no voice"}
                      {o.chatSlots > 0 ? ` · chat ×${o.chatSlots}` : ""}
                    </td>
                    <td style={tdNum}>
                      {o.phoneLines}
                      {o.grantedPhoneLines > 0 ? (
                        <span style={{ color: C.warn }} title="provisioned by a grant">
                          {" "}
                          ({o.grantedPhoneLines} granted)
                        </span>
                      ) : null}
                    </td>
                    <td style={tdNum}>{minutes(o.allTime.billableMinutes)}</td>
                    <td style={tdNum}>{usd(o.allTime.costUsd)}</td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {o.workspaceStatus === "paused" ? (
                        <span style={{ color: C.bad }}>paused · {o.pausedReason ?? "unknown"}</span>
                      ) : (
                        <span style={{ color: C.good }}>active</span>
                      )}
                    </td>
                    <td style={{ ...td, fontSize: 12 }}>
                      {hasGrant ? (
                        <span style={{ color: C.warn }}>
                          {[
                            o.grants.voiceMinutes > 0 ? `${o.grants.voiceMinutes} min` : null,
                            o.grants.chatSlots > 0 ? `${o.grants.chatSlots} chat` : null,
                            o.grants.phoneNumbers > 0 ? `${o.grants.phoneNumbers} num` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {o.grants.endsAt ? ` → ${new Date(o.grants.endsAt).toLocaleDateString()}` : ""}
                        </span>
                      ) : (
                        <span style={{ color: C.muted }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Grant a trial"
        note="A grant raises capacity without writing a billing row, so nothing here reaches a revenue figure. Provisioning a phone number spends real money."
      >
        <GrantPanel
          orgs={overview.orgs.map((o) => ({
            orgId: o.orgId,
            name: o.name,
            ownerEmail: o.ownerEmail,
            voicePlanCode: o.voicePlanCode,
            grants: o.grants,
            history: (history.get(o.orgId) ?? []).map((g) => ({
              id: g.id,
              kind: g.kind,
              amount: Number(g.amount ?? 0),
              expiresAt: g.expires_at,
              status: g.status,
              note: g.note,
            })),
          }))}
        />
      </Section>

      <Section title="Read these numbers with this in mind">
        <ul style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          {overview.caveats.map((c) => (
            <li key={c}>{c}</li>
          ))}
          <li>
            A granted minute cap is applied after the call that crosses it — Denku learns a call&apos;s length from
            the end-of-call webhook, so a trial can overrun by at most one call.
          </li>
        </ul>
      </Section>
    </div>
  );
}

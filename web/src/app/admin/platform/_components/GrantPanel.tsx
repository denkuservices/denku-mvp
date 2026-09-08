"use client";

import * as React from "react";

/**
 * The grant form — the only place in the product where capacity is handed out for free.
 *
 * Two things about it are deliberate rather than decorative:
 *
 *   1. **The preset buttons.** A trial is nearly always the same shape ("30 minutes of voice and a
 *      chat channel for a week"), and typing three numbers into three boxes each time is where a
 *      zero gets added. The presets are the normal path; the fields are there for the exception.
 *   2. **Provisioning a number is a separate, unticked checkbox with its own warning.** Every other
 *      grant on this form raises a ceiling and costs nothing. That one rents a phone number that
 *      bills every month until somebody takes it back, and it should never be something an operator
 *      does by not noticing a default.
 */

type GrantSummary = { voiceMinutes: number; chatSlots: number; phoneNumbers: number; endsAt: string | null };

type HistoryEntry = {
  id: string;
  kind: string;
  amount: number;
  expiresAt: string;
  status: string;
  note: string | null;
};

export type PanelOrg = {
  orgId: string;
  name: string;
  ownerEmail: string | null;
  voicePlanCode: string | null;
  grants: GrantSummary;
  history: HistoryEntry[];
};

const KINDS = [
  { value: "voice_minutes", label: "Voice minutes", unit: "minutes", max: 2000 },
  { value: "chat_slots", label: "Chat channels", unit: "channels", max: 5 },
  { value: "phone_numbers", label: "Phone-number slots", unit: "numbers", max: 2 },
] as const;

const C = {
  ink: "#0a1a2f",
  muted: "#64748b",
  line: "#e2e8f0",
  soft: "#f8fafc",
  accent: "#2563eb",
  warn: "#d97706",
  bad: "#dc2626",
  good: "#16a34a",
};

const input: React.CSSProperties = {
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
  color: C.ink,
  background: "#fff",
};

const label: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: C.muted,
  display: "block",
  marginBottom: 4,
};

export function GrantPanel({ orgs }: { orgs: PanelOrg[] }) {
  const [orgId, setOrgId] = React.useState<string>(orgs[0]?.orgId ?? "");
  const [kind, setKind] = React.useState<string>("voice_minutes");
  const [amount, setAmount] = React.useState<number>(30);
  const [days, setDays] = React.useState<number>(7);
  const [note, setNote] = React.useState<string>("");
  const [provisionLine, setProvisionLine] = React.useState(false);
  const [areaCode, setAreaCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const org = orgs.find((o) => o.orgId === orgId) ?? null;
  const spec = KINDS.find((k) => k.value === kind)!;

  // Ticking the box on a non-phone grant would be refused by the API anyway; clearing it here means
  // the operator never sees that refusal.
  React.useEffect(() => {
    if (kind !== "phone_numbers") setProvisionLine(false);
  }, [kind]);

  async function submit(overrides?: { kind: string; amount: number; days: number }) {
    const payload = {
      orgId,
      kind: overrides?.kind ?? kind,
      amount: overrides?.amount ?? amount,
      days: overrides?.days ?? days,
      note: note.trim() || undefined,
      provisionLine: (overrides?.kind ?? kind) === "phone_numbers" ? provisionLine : false,
      preferredAreaCode: /^\d{3}$/.test(areaCode) ? areaCode : undefined,
    };

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/platform/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setMessage({ tone: "err", text: data?.error || `Refused (${res.status})` });
        return;
      }

      // The line is reported separately from the grant, because "you did not ask for a number" and
      // "you asked and Vapi refused" are different outcomes and the operator has to be able to
      // tell them apart before walking away.
      const lineNote = data.lineRequested
        ? data.line
          ? ` Provisioned ${data.line.phoneNumberE164 ?? "a number"}.`
          : " The grant is in place but the phone number could NOT be provisioned — retry, or check the logs."
        : "";

      setMessage({
        tone: data.lineRequested && !data.line ? "err" : "ok",
        text: `Granted ${payload.amount} ${spec.unit} for ${payload.days} day(s).${lineNote}`,
      });
      // A grant changes the table above it, so the page has to be re-read rather than patched.
      setTimeout(() => window.location.reload(), 1400);
    } catch (err) {
      setMessage({ tone: "err", text: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(grantId: string) {
    if (!window.confirm("Withdraw this grant now? Any phone number it paid for is released.")) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/platform/grants/${grantId}/revoke`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setMessage({ tone: "err", text: data?.error || `Refused (${res.status})` });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Withdrawn. ${data.linesReleased} phone line(s) released.`,
      });
      setTimeout(() => window.location.reload(), 1400);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 16, background: "#fff" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={label}>Workspace</label>
          <select style={input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.map((o) => (
              <option key={o.orgId} value={o.orgId}>
                {o.name} {o.ownerEmail ? `· ${o.ownerEmail}` : ""} {o.voicePlanCode ? `· ${o.voicePlanCode}` : "· no voice plan"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>What</label>
          <select style={input} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={label}>How much ({spec.unit}, max {spec.max})</label>
          <input
            style={input}
            type="number"
            min={1}
            max={spec.max}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>

        <div>
          <label style={label}>For how long (days)</label>
          <input
            style={input}
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={label}>Why (kept on the record)</label>
          <input
            style={input}
            value={note}
            placeholder="e.g. demo for Minos & Co before they pick a plan"
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </div>
      </div>

      {kind === "phone_numbers" ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            fontSize: 13,
          }}
        >
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={provisionLine}
              onChange={(e) => setProvisionLine(e.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Also buy a real phone number for them.</strong>{" "}
              <span style={{ color: C.warn }}>
                This spends money now and keeps billing monthly until the grant is withdrawn or lapses.
              </span>{" "}
              Leave it off to only raise their line allowance — then they can connect a number they already own.
            </span>
          </label>
          {provisionLine ? (
            <div style={{ marginTop: 10, maxWidth: 200 }}>
              <label style={label}>Preferred area code (optional)</label>
              <input style={input} value={areaCode} placeholder="321" maxLength={3} onChange={(e) => setAreaCode(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy || !orgId}
          onClick={() => submit()}
          style={{
            background: C.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Working…" : "Grant"}
        </button>

        <span style={{ fontSize: 12, color: C.muted }}>or the usual trial:</span>
        <button
          type="button"
          disabled={busy || !orgId}
          onClick={() => submit({ kind: "voice_minutes", amount: 30, days: 7 })}
          style={presetButton}
        >
          30 voice minutes · 7 days
        </button>
        <button
          type="button"
          disabled={busy || !orgId}
          onClick={() => submit({ kind: "chat_slots", amount: 1, days: 7 })}
          style={presetButton}
        >
          1 chat channel · 7 days
        </button>
      </div>

      {message ? (
        <p style={{ marginTop: 12, fontSize: 13, color: message.tone === "ok" ? C.good : C.bad }}>{message.text}</p>
      ) : null}

      <p style={{ marginTop: 12, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
        A voice grant caps minutes by pausing the workspace once they are spent — which unbinds their numbers, so the
        next caller reaches nobody. It cannot cut off a call already in progress, so a trial can overshoot by one call.
        Chat and phone-slot grants simply lapse on their end date.
      </p>

      {org && org.history.length > 0 ? (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <div style={{ ...label, marginBottom: 8 }}>Grants on {org.name}</div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
            {org.history.map((g) => (
              <li
                key={g.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 12,
                  background: C.soft,
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <span>
                  <strong>
                    {g.amount} {KINDS.find((k) => k.value === g.kind)?.unit ?? g.kind}
                  </strong>{" "}
                  until {new Date(g.expiresAt).toLocaleDateString()}
                  {g.note ? <span style={{ color: C.muted }}> — {g.note}</span> : null}
                </span>
                {g.status === "active" ? (
                  <button type="button" disabled={busy} onClick={() => revoke(g.id)} style={revokeButton}>
                    Withdraw
                  </button>
                ) : (
                  <span style={{ color: C.muted }}>withdrawn</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

const presetButton: React.CSSProperties = {
  background: "#fff",
  color: C.ink,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const revokeButton: React.CSSProperties = {
  background: "#fff",
  color: C.bad,
  border: `1px solid ${C.bad}`,
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

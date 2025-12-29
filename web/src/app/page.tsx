"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submitLead(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault();
  setLoading(true);
  setOk(null);
  setErr(null);

  const formEl = e.currentTarget; // <- form referansı
  const form = new FormData(formEl);

  const payload = {
    name: String(form.get("name") || ""),
    email: String(form.get("email") || ""),
    company: String(form.get("company") || ""),
    use_case: String(form.get("use_case") || ""),
    source: "landing",
  };

  const { error } = await supabase.from("leads").insert(payload);

  if (error) {
    setErr(error.message);
  } else {
    setOk("Thanks — we’ll reach out shortly.");
    formEl.reset(); // <- artık null olmaz
  }

  setLoading(false);
}


  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 32, maxWidth: 980, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontWeight: 700 }}>Denku</div>
        <nav style={{ display: "flex", gap: 14, fontSize: 14 }}>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#cta">Request access</a>
        </nav>
      </header>

      <section style={{ marginTop: 56, padding: 28, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 16 }}>
        <h1 style={{ fontSize: 44, margin: 0 }}>
          Autonomous AI agents that run your customer operations.
        </h1>

        <p style={{ marginTop: 14, opacity: 0.85 }}>
          Denku answers inbound calls, books appointments, and creates categorized support tickets—24/7.
        </p>

        <div id="cta" style={{ marginTop: 18 }}>
          <form onSubmit={submitLead} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input name="name" placeholder="Name" style={inputStyle} />
              <input name="company" placeholder="Company" style={inputStyle} />
            </div>

            <input name="email" type="email" placeholder="Work email" required style={inputStyle} />

            <textarea
              name="use_case"
              placeholder="What do you want the agent to handle?"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Submitting..." : "Request access"}
            </button>

            {ok && <div>{ok}</div>}
            {err && <div>Error: {err}</div>}
          </form>
        </div>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "transparent",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "black",
  color: "white",
  fontWeight: 600,
};

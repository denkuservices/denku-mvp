export const dynamic = "force-dynamic";

async function getData() {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const headers: Record<string, string> = {};

  // If you later add admin auth, put it here.
  const [leadsRes, apptRes, ticketRes] = await Promise.all([
    fetch(`${base}/api/admin/leads`, { cache: "no-store", headers }),
    fetch(`${base}/api/admin/appointments`, { cache: "no-store", headers }),
    fetch(`${base}/api/admin/tickets`, { cache: "no-store", headers }),
  ]);

  return {
    leads: await leadsRes.json(),
    appointments: await apptRes.json(),
    tickets: await ticketRes.json(),
  };
}

export default async function AdminPage() {
  const data = await getData();

  return (
    <main style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Denku Admin</h1>
      <p style={{ opacity: 0.75, marginTop: 8 }}>Leads, appointments, and tickets (latest 50).</p>

      <Section title="Leads" json={data.leads} />
      <Section title="Appointments" json={data.appointments} />
      <Section title="Tickets" json={data.tickets} />
    </main>
  );
}

function Section({ title, json }: { title: string; json: any }) {
  const pretty = JSON.stringify(json, null, 2);
  return (
    <section style={{ marginTop: 18, border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: 12, opacity: 0.9 }}>
        {pretty}
      </pre>
    </section>
  );
}

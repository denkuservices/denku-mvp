import { supabaseServer } from '@/lib/supabase/server';

type SearchParams = {
  org?: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const orgId = sp.org ?? '';

  if (!orgId) {
    return (
      <main className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-gray-400">
          Missing <code>org</code> query param.
        </p>
        <p className="text-sm">
          Example:{' '}
          <code>
            /admin?org=15a79057-7cca-4b17-9076-59d05b4dd375
          </code>
        </p>
      </main>
    );
  }

  const [leadsRes, callsRes, ticketsRes, apptsRes] = await Promise.all([
    supabaseServer
      .from('leads')
      .select('id, name, phone, status, source, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseServer
      .from('calls')
      .select('id, vapi_call_id, from_phone, to_phone, outcome, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseServer
      .from('tickets')
      .select('id, subject, status, priority, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseServer
      .from('appointments')
      .select('id, start_at, end_at, status, created_at')
      .eq('org_id', orgId)
      .order('start_at', { ascending: true })
      .limit(20),
  ]);

  const leads = leadsRes.data ?? [];
  const calls = callsRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const appointments = apptsRes.data ?? [];

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
        <p className="text-sm text-gray-400">
          Org: <code>{orgId}</code>
        </p>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Leads (latest)">
          <SimpleTable
            headers={['Name', 'Phone', 'Status', 'Source', 'Created']}
            rows={leads.map((l) => [
              l.name ?? '-',
              l.phone ?? '-',
              l.status ?? '-',
              l.source ?? '-',
              formatDate(l.created_at),
            ])}
            empty="No leads yet."
          />
        </Card>

        <Card title="Calls (latest)">
          <SimpleTable
            headers={['From', 'To', 'Outcome', 'Created', 'Vapi Call ID']}
            rows={calls.map((c) => [
              c.from_phone ?? '-',
              c.to_phone ?? '-',
              c.outcome ?? '-',
              formatDate(c.created_at),
              c.vapi_call_id ?? '-',
            ])}
            empty="No calls yet."
          />
        </Card>

        <Card title="Tickets (latest)">
          <SimpleTable
            headers={['Subject', 'Status', 'Priority', 'Created']}
            rows={tickets.map((t) => [
              t.subject ?? '-',
              t.status ?? '-',
              t.priority ?? '-',
              formatDate(t.created_at),
            ])}
            empty="No tickets yet."
          />
        </Card>

        <Card title="Appointments (upcoming)">
          <SimpleTable
            headers={['Start', 'End', 'Status', 'Created']}
            rows={appointments.map((a) => [
              formatDate(a.start_at),
              a.end_at ? formatDate(a.end_at) : '-',
              a.status ?? '-',
              formatDate(a.created_at),
            ])}
            empty="No appointments yet."
          />
        </Card>
      </section>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-gray-400">{empty}</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-gray-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left font-medium py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-t border-white/10">
              {r.map((cell, cidx) => (
                <td key={cidx} className="py-2 pr-4 align-top">
                  {cell as any}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(input: any) {
  if (!input) return '-';
  try {
    const d = new Date(input);
    return d.toLocaleString();
  } catch {
    return String(input);
  }
}

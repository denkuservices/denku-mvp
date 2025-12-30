import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";

type Org = {
  id: string;
  name: string;
  created_at?: string;
};

type Profile = {
  id: string;
  org_id: string | null;
  email: string | null;
  full_name: string | null;
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) redirect("/login");

  // Profile
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, org_id, email, full_name")
    .eq("id", user.id)
    .single<Profile>();

  if (profErr) {
    // Profile yoksa, MVP'de login'i bloklamıyoruz; ama kullanıcıya net bilgi veriyoruz
    // (İstersen burada otomatik repair yaparız.)
  }

  let org: Org | null = null;
  // Agent count (org bazlı)
  let agentCount: number | null = null;
  if (profile?.org_id) {
    const { count } = await supabase
      .from("agents")
      .select("*", { count: "exact", head: true })
      .eq("org_id", profile.org_id);

    agentCount = typeof count === "number" ? count : null;
  }

  if (profile?.org_id) {
    const { data: orgData } = await supabase
      .from("orgs")
      .select("id, name, created_at")
      .eq("id", profile.org_id)
      .single<Org>();
    org = orgData ?? null;
  }

  const displayName =
    profile?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email ||
    "User";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome, {displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border px-2 py-1">
              Org: <span className="font-medium">{org?.name ?? "—"}</span>
            </span>
            <span className="rounded-full border px-2 py-1">
              Status: <span className="font-medium">Active</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Admin
          </Link>

          <form action={signOutAction}>
            <button className="rounded-md bg-black text-white px-3 py-2 text-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* KPI / Status cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Agents" value={agentCount === null ? "—" : String(agentCount)} hint="Create your first agent" />
        <Card title="Leads (7d)" value="—" hint="Wire CRM intake next" />
        <Card title="Tickets (7d)" value="—" hint="Support workflow" />
        <Card title="Calls (7d)" value="—" hint="Connect voice logs" />
      </section>

      {/* Quick actions */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Common setup tasks to get value quickly.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Action
              title="Create an agent"
              desc="Name, language, and tools in under a minute."
              href="/dashboard/agents/new"
              badge="Next"
            />
            <Action
              title="Connect channels"
              desc="Web chat, WhatsApp, phone—route into the same brain."
              href="/dashboard/channels"
              badge="Next"
            />
            <Action
              title="View leads"
              desc="See captured leads and structured fields."
              href="/admin"
              badge="Now"
            />
            <Action
              title="Test a workflow"
              desc="Send a sample payload and verify responses."
              href="/dashboard/tools"
              badge="Next"
            />
          </div>
        </div>

        {/* Setup checklist */}
        <div className="rounded-2xl border p-5">
          <h2 className="text-lg font-semibold">Setup checklist</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Minimum steps for a client-ready demo.
          </p>

          <ol className="mt-4 space-y-3 text-sm">
            <ChecklistItem done={false} title="Create first agent" />
            <ChecklistItem done={false} title="Set language + tone" />
            <ChecklistItem done={false} title="Enable 1 tool (create ticket)" />
            <ChecklistItem done={false} title="Connect 1 channel (web chat)" />
          </ol>

          <div className="mt-5">
            <Link
              href="/dashboard/agents/new"
              className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm text-white"
            >
              Start setup
            </Link>
          </div>
        </div>
      </section>

      {/* Debug (only if profile missing) */}
      {!profile && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
          <div className="font-semibold text-red-800">Profile not found</div>
          <div className="mt-1 text-red-700">
            Your auth user exists, but a matching row in <code>profiles</code> was
            not found. This can happen if signup was interrupted. We can add an
            auto-repair action next.
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border p-5">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Action({
  title,
  desc,
  href,
  badge,
}: {
  title: string;
  desc: string;
  href: string;
  badge: "Now" | "Next";
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border p-4 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-xs border ${
            badge === "Now" ? "bg-white" : "bg-gray-50"
          }`}
        >
          {badge}
        </span>
      </div>
      <div className="mt-3 text-sm underline underline-offset-4 opacity-0 group-hover:opacity-100 transition-opacity">
        Open
      </div>
    </Link>
  );
}

function ChecklistItem({ done, title }: { done: boolean; title: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
          done ? "bg-black text-white" : "bg-white"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={done ? "line-through text-muted-foreground" : ""}>{title}</span>
    </li>
  );
}

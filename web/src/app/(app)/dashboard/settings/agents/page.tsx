"use client";

import * as React from "react";
import Link from "next/link";
import { SettingsShell } from "@/app/(app)/dashboard/settings/_components/SettingsShell";

type AgentStatus = "active" | "paused" | "draft" | "error";

type AgentListItem = {
  id: string;
  name: string;
  role: "Support" | "Sales" | "Booking" | "General";
  status: AgentStatus;
  environment: "Production" | "Staging";
  lastUpdatedAt: string; // ISO
};

const MOCK_AGENTS: AgentListItem[] = [
  {
    id: "denku-mvp",
    name: "Denku-MVP",
    role: "General",
    status: "active",
    environment: "Production",
    lastUpdatedAt: "2026-01-01T23:13:05Z",
  },
  {
    id: "support-1",
    name: "Support Agent",
    role: "Support",
    status: "active",
    environment: "Production",
    lastUpdatedAt: "2026-01-01T18:02:41Z",
  },
  {
    id: "sales-1",
    name: "Sales Closer",
    role: "Sales",
    status: "paused",
    environment: "Production",
    lastUpdatedAt: "2025-12-31T20:44:10Z",
  },
  {
    id: "booking-1",
    name: "Booking Concierge",
    role: "Booking",
    status: "draft",
    environment: "Staging",
    lastUpdatedAt: "2025-12-30T14:25:00Z",
  },
  {
    id: "legacy-2",
    name: "Legacy Agent (Deprecated)",
    role: "General",
    status: "error",
    environment: "Production",
    lastUpdatedAt: "2025-12-29T02:10:00Z",
  },
];

type SortKey = "name" | "updated";
type SortDir = "asc" | "desc";

function formatRelative(dateIso: string) {
  const d = new Date(dateIso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatDateTime(dateIso: string) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusPill(status: AgentStatus) {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-zinc-900 text-white border-zinc-200" };
    case "paused":
      return { label: "Paused", className: "bg-white text-zinc-700 border-zinc-200" };
    case "draft":
      return { label: "Draft", className: "bg-zinc-50 text-zinc-700 border-zinc-200" };
    case "error":
      return { label: "Needs attention", className: "bg-red-50 text-red-700 border-red-200" };
  }
}

export default function AgentsListPage() {
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | AgentStatus>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Row action menu
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    let rows = MOCK_AGENTS.filter((a) => {
      const matchesQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.role.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" ? true : a.status === statusFilter;

      return matchesQuery && matchesStatus;
    });

    rows = rows.sort((a, b) => {
      const cmp =
        sortKey === "name"
          ? a.name.localeCompare(b.name)
          : new Date(a.lastUpdatedAt).getTime() - new Date(b.lastUpdatedAt).getTime();

      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [query, statusFilter, sortKey, sortDir]);

  const totals = React.useMemo(() => {
    const total = MOCK_AGENTS.length;
    const active = MOCK_AGENTS.filter((a) => a.status === "active").length;
    const attention = MOCK_AGENTS.filter((a) => a.status === "error").length;
    return { total, active, attention };
  }, []);

  return (
    <SettingsShell
      title="Agents"
      subtitle="Manage your agents — behavior, language, and advanced overrides."
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Agents" },
      ]}
    >
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard label="Total agents" value={String(totals.total)} />
        <KpiCard label="Active" value={String(totals.active)} />
        <KpiCard label="Needs attention" value={String(totals.attention)} />
      </div>

      {/* Toolbar */}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <label className="sr-only" htmlFor="agent-search">
                Search
              </label>
              <input
                id="agent-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, ID, or role…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
              />
            </div>

            <div className="flex gap-3">
              <Select
                label="Status"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as any)}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "draft", label: "Draft" },
                  { value: "error", label: "Needs attention" },
                ]}
              />

              <Select
                label="Sort"
                value={`${sortKey}:${sortDir}`}
                onChange={(v) => {
                  const [k, d] = String(v).split(":");
                  setSortKey(k as SortKey);
                  setSortDir(d as SortDir);
                }}
                options={[
                  { value: "updated:desc", label: "Last updated (newest)" },
                  { value: "updated:asc", label: "Last updated (oldest)" },
                  { value: "name:asc", label: "Name (A → Z)" },
                  { value: "name:desc", label: "Name (Z → A)" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled
              title="Coming soon"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
            >
              Create agent
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <p className="text-sm font-semibold text-zinc-900">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-zinc-200">
            {filtered.map((a) => {
              const pill = statusPill(a.status);

              return (
                <li key={a.id} className="px-6 py-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/settings/agents/${a.id}`}
                          className="text-base font-semibold text-zinc-900 hover:underline"
                          title={`Open ${a.name}`}
                        >
                          {a.name}
                        </Link>

                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${pill.className}`}
                        >
                          {pill.label}
                        </span>

                        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-700">
                          {a.role}
                        </span>

                        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700">
                          {a.environment}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 md:flex-row md:items-center md:gap-3">
                        <span className="font-mono text-zinc-500">ID: {a.id}</span>
                        <span className="hidden md:inline-block text-zinc-300">•</span>
                        <span title={formatDateTime(a.lastUpdatedAt)}>
                          Updated {formatRelative(a.lastUpdatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Row actions: one menu */}
                    <div className="flex items-center justify-end">
                      <RowActions
                        agentId={a.id}
                        openMenuId={openMenuId}
                        setOpenMenuId={setOpenMenuId}
                      />
                    </div>
                  </div>

                  {a.status === "error" ? (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                      <p className="text-sm font-semibold text-red-900">Action required</p>
                      <p className="mt-1 text-sm text-red-900/80">
                        This agent needs attention. Review advanced overrides or integration status.
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SettingsShell>
  );
}

/* ----------------------------- Row actions menu ----------------------------- */

function RowActions({
  agentId,
  openMenuId,
  setOpenMenuId,
}: {
  agentId: string;
  openMenuId: string | null;
  setOpenMenuId: (v: string | null) => void;
}) {
  const isOpen = openMenuId === agentId;
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!isOpen) return;
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target)) setOpenMenuId(null);
    }
    function onEsc(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") setOpenMenuId(null);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isOpen, setOpenMenuId]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenMenuId(isOpen ? null : agentId)}
        className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 shadow-sm transition hover:bg-zinc-50"
        title="Actions"
      >
        <KebabIcon />
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg"
        >
          <MenuItem href={`/dashboard/settings/agents/${agentId}`} title="Configure">
            Configure
          </MenuItem>

          <MenuItem href={`/dashboard/settings/agents/${agentId}/advanced`} title="Advanced">
            Advanced
          </MenuItem>

          <div className="my-1 border-t border-zinc-200" />

          <MenuButton disabled title="Coming soon">
            View calls (coming soon)
          </MenuButton>

          <MenuButton disabled title="Coming soon">
            Duplicate agent (coming soon)
          </MenuButton>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  href,
  title,
  children,
}: {
  href: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      title={title}
      className="block px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
    >
      {children}
    </Link>
  );
}

function MenuButton({
  disabled,
  title,
  children,
}: {
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={title}
      className="block w-full px-4 py-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm0 8a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm0 8a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ----------------------------- UI bits ----------------------------- */

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[180px]">
      <label className="sr-only">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
        <p className="text-base font-semibold text-zinc-900">No agents found</p>
        <p className="mt-2 text-sm text-zinc-600">Try a different search, or adjust filters.</p>

        <button
          disabled
          className="mt-6 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm opacity-60"
          title="Coming soon"
        >
          Create agent
        </button>
      </div>
    </div>
  );
}

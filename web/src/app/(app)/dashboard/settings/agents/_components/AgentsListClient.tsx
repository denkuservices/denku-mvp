"use client";

import * as React from "react";
import Link from "next/link";

type AgentRow = {
  id: string;
  name: string | null;
  created_at: string;
  updated_at: string | null;
};

type AgentsListClientProps = {
  agents: AgentRow[];
};

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

export function AgentsListClient({ agents: initialAgents }: AgentsListClientProps) {
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("updated");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  // Row action menu
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    let rows = initialAgents.filter((a) => {
      const matchesQuery =
        !q ||
        (a.name?.toLowerCase().includes(q) ?? false) ||
        a.id.toLowerCase().includes(q);

      return matchesQuery;
    });

    rows = rows.sort((a, b) => {
      const cmp =
        sortKey === "name"
          ? (a.name || a.id).localeCompare(b.name || b.id)
          : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [initialAgents, query, sortKey, sortDir]);

  const totals = React.useMemo(() => {
    const total = initialAgents.length;
    return { total, active: total, attention: 0 };
  }, [initialAgents]);

  return (
    <>
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
                placeholder="Search by name or ID…"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base shadow-sm outline-none transition focus:ring-4 focus:ring-zinc-100"
              />
            </div>

            <div className="flex gap-3">
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
        {initialAgents.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="border-b border-zinc-200 px-6 py-4">
              <p className="text-sm font-semibold text-zinc-900">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}
              </p>
            </div>

            {filtered.length === 0 ? (
              <div className="px-6 py-12">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
                  <p className="text-base font-semibold text-zinc-900">No agents match your search</p>
                  <p className="mt-2 text-sm text-zinc-600">Try adjusting your search query or filters.</p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200">
                {filtered.map((a) => {
                  const agentName = a.name || `Agent ${a.id.substring(0, 8)}`;
                  const displayId = a.id.substring(0, 8) + "…";

                  return (
                    <li key={a.id} className="px-6 py-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/settings/agents/${a.id}`}
                              className="text-base font-semibold text-zinc-900 hover:underline"
                              title={`Open ${agentName}`}
                            >
                              {agentName}
                            </Link>
                          </div>

                          <div className="mt-2 flex flex-col gap-1 text-sm text-zinc-600 md:flex-row md:items-center md:gap-3">
                            <span className="font-mono text-zinc-500">ID: {displayId}</span>
                            <span className="hidden md:inline-block text-zinc-300">•</span>
                            <span title={formatDateTime(a.created_at)}>
                              Created {formatRelative(a.created_at)}
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
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </>
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
        <p className="text-base font-semibold text-zinc-900">No agents yet</p>
        <p className="mt-2 text-sm text-zinc-600">
          Get started by creating your first agent to handle calls and conversations.
        </p>

        <Link
          href="/dashboard/agents/new"
          className="mt-6 inline-block rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 transition"
        >
          Create agent
        </Link>
      </div>
    </div>
  );
}


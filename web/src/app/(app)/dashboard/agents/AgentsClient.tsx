"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { AgentListRow } from "@/lib/agents/queries";
import { Badge } from "@/components/ui-horizon/badge";
import { HorizonLinkButton } from "@/components/ui-horizon/button";
import Card from "@/components/ui-horizon/card";
import { CONTROL_CLASS, SearchControl } from "@/components/ui-horizon/controls";
import { EmptyState } from "@/components/ui-horizon/empty";

interface AgentsClientProps {
  agents: AgentListRow[];
  columnLabels?: {
    name: string;
    language: string;
    status: string;
    live: string;
    lastActivity: string;
    actions: string;
  };
  title?: string;
  emptyStateMessage?: string;
  noResultsMessage?: string;
  languageFilterLabel?: string;
  isPhoneLinesMode?: boolean;
  rowLinkBasePath?: string; // Base path for row links (default: "/dashboard/agents")
}

/**
 * Validate if a Date object is valid.
 */
function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * Format relative time from ISO string.
 * Returns "—" if input is null/undefined/invalid.
 */
function timeAgoLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isValidDate(d)) return "—";

  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/**
 * Format absolute time from ISO string for tooltip.
 * Returns "—" if input is null/undefined/invalid.
 */
function formatAbsoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (!isValidDate(dt)) return "—";
  return dt.toLocaleString();
}

function maskPhone(phone: string | null, isPhoneLinesMode: boolean = false): string {
  if (!phone) return isPhoneLinesMode ? "—" : "No number";
  if (phone.length <= 4) return phone;
  return `•••• ${phone.slice(-4)}`;
}

export default function AgentsClient({
  agents: initialAgents,
  columnLabels = {
    name: "NAME",
    language: "LANGUAGE",
    status: "STATUS",
    live: "LIVE",
    lastActivity: "LAST ACTIVITY",
    actions: "ACTIONS",
  },
  title = "Agents",
  emptyStateMessage = "No agents found yet.",
  noResultsMessage = "No agents match your filters.",
  languageFilterLabel = "All Languages",
  isPhoneLinesMode = false,
  rowLinkBasePath = "/dashboard/agents",
}: AgentsClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Connected" | "Issues">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");

  // Get unique languages
  const languages = useMemo(() => {
    const langs = new Set<string>();
    initialAgents.forEach((a) => {
      if (a.language) langs.add(a.language);
    });
    return Array.from(langs).sort();
  }, [initialAgents]);

  // Filter and sort agents
  const filteredAgents = useMemo(() => {
    let filtered = [...initialAgents];

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          (a.inbound_phone && a.inbound_phone.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }

    // Language filter
    if (languageFilter !== "all") {
      filtered = filtered.filter((a) => a.language === languageFilter);
    }

    // Sort
    if (sortBy === "name-asc") {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "name-desc") {
      filtered.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortBy === "last-activity") {
      filtered.sort((a, b) => {
        if (a.last_call_at && b.last_call_at) {
          const aTime = new Date(a.last_call_at).getTime();
          const bTime = new Date(b.last_call_at).getTime();
          if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
            return bTime - aTime;
          }
        } else if (a.last_call_at) return -1;
        else if (b.last_call_at) return 1;
        return 0;
      });
    }
    // Default sorting already done server-side

    return filtered;
  }, [initialAgents, search, statusFilter, languageFilter, sortBy]);

  return (
    <>
      {initialAgents.length === 0 ? (
        <Card className="p-0">
          <EmptyState title={emptyStateMessage} description="Connected AI profiles will appear here." />
        </Card>
      ) : (
        <Card className="p-0">
          <div className="w-full h-full sm:overflow-auto px-6">
            <div className="relative flex flex-col gap-3 pt-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-xl font-bold text-navy-700 dark:text-white">{title}</div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Compact search */}
                <SearchControl
                  aria-label="Search AI profiles"
                  placeholder="Search by name or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-56"
                />
                {/* Status filter */}
                <select
                  aria-label="Filter by status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className={`${CONTROL_CLASS} w-auto min-w-36`}
                >
                  <option value="all">All Status</option>
                  <option value="Connected">Connected</option>
                  <option value="Issues">Issues</option>
                </select>
                {/* Language filter */}
                <select
                  aria-label="Filter by language"
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className={`${CONTROL_CLASS} w-auto min-w-36`}
                >
                  <option value="all">{languageFilterLabel}</option>
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                {/* Sort */}
                <select
                  aria-label="Sort AI profiles"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className={`${CONTROL_CLASS} w-auto min-w-36`}
                >
                  <option value="default">Issues first</option>
                  <option value="last-activity">Last activity</option>
                  <option value="name-asc">Name A→Z</option>
                </select>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="!border-px !border-gray-200 dark:!border-white/20">
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">{columnLabels.name}</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">{columnLabels.language}</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">{columnLabels.status}</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">{columnLabels.live}</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">
                        {isPhoneLinesMode ? "ACTIVITY" : columnLabels.lastActivity}
                      </p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-right">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">{columnLabels.actions}</p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        {noResultsMessage}
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => {
                      // Safe date handling: last_call_at is string | null
                      const lastCallAtDisplay = timeAgoLabel(agent.last_call_at);
                      const lastCallAtTooltip = formatAbsoluteTime(agent.last_call_at);

                      return (
                        <tr key={agent.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`${rowLinkBasePath}/${agent.id}`} className="block group">
                              {isPhoneLinesMode ? (
                                <>
                                  <p className={`text-sm group-hover:underline ${
                                    agent.inbound_phone
                                      ? "font-bold text-navy-700 dark:text-white"
                                      : "font-medium text-gray-500 dark:text-gray-400"
                                  }`}>
                                    {agent.inbound_phone || "Not assigned"}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {agent.name}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="text-sm font-bold text-navy-700 dark:text-white group-hover:underline">
                                    {agent.name}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {maskPhone(agent.inbound_phone, isPhoneLinesMode)}
                                  </p>
                                </>
                              )}
                            </Link>
                          </td>
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`${rowLinkBasePath}/${agent.id}`} className="block" tabIndex={-1}>
                              {isPhoneLinesMode ? (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-navy-700 dark:text-gray-300">
                                  Support
                                </span>
                              ) : (
                                <p className="text-sm font-bold text-navy-700 dark:text-white">
                                  {agent.language ?? "—"}
                                </p>
                              )}
                            </Link>
                          </td>
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`${rowLinkBasePath}/${agent.id}`} className="block" tabIndex={-1}>
                              <Badge variant={agent.status === "Connected" ? "success" : "destructive"} dot>
                                {agent.status}
                              </Badge>
                            </Link>
                          </td>
                          <td className="min-w-[100px] border-white/0 py-3 pr-4">
                            <p
                              className={`text-sm font-bold text-navy-700 dark:text-white ${
                                agent.active_calls >= agent.plan_limit
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : ""
                              }`}
                              title={isPhoneLinesMode ? agent.name : undefined}
                            >
                              {isPhoneLinesMode ? agent.name || "Main Assistant" : `${agent.active_calls} / ${agent.plan_limit}`}
                            </p>
                          </td>
                          <td className="min-w-[120px] border-white/0 py-3 pr-4">
                            {isPhoneLinesMode ? (
                              <div>
                                <p className="text-sm font-bold text-navy-700 dark:text-white">
                                  0 calls today
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  Last: —
                                </p>
                              </div>
                            ) : (
                              <p
                                className="text-sm font-bold text-navy-700 dark:text-white"
                                title={lastCallAtTooltip}
                              >
                                {lastCallAtDisplay}
                              </p>
                            )}
                          </td>
                          <td className="min-w-[80px] border-white/0 py-3 pr-4 text-right">
                            <HorizonLinkButton href={`${rowLinkBasePath}/${agent.id}`} variant="ghost" size="sm">
                              View
                            </HorizonLinkButton>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

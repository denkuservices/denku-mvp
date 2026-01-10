"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BsThreeDotsVertical } from "react-icons/bs";
import { Edit, PhoneCall, Power } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AgentListRow } from "@/lib/agents/queries";

interface AgentsClientProps {
  agents: AgentListRow[];
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

function maskPhone(phone: string | null): string {
  if (!phone) return "No number";
  if (phone.length <= 4) return phone;
  return `•••• ${phone.slice(-4)}`;
}

function AgentActionsMenu({
  agentId,
  agentName,
  onDetails,
  onEdit,
  onTestCall,
  onDisable,
}: {
  agentId: string;
  agentName: string;
  onDetails: () => void;
  onEdit: () => void;
  onTestCall: () => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);

  const handleAction = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="flex justify-end">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-center rounded-lg bg-lightPrimary p-2 text-brand-500 hover:bg-gray-100 dark:bg-navy-700 dark:text-white dark:hover:bg-white/20 transition duration-200"
          >
            <BsThreeDotsVertical className="h-5 w-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-max p-0 rounded-xl bg-white shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 space-y-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(onDetails);
              }}
              className="hover:text-black flex w-full cursor-pointer items-center gap-2 text-gray-600 hover:font-medium text-left"
            >
              Details
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(onEdit);
              }}
              className="hover:text-black mt-2 flex w-full cursor-pointer items-center gap-2 text-gray-600 hover:font-medium text-left"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(onTestCall);
              }}
              className="hover:text-black mt-2 flex w-full cursor-pointer items-center gap-2 text-gray-600 hover:font-medium text-left"
            >
              <PhoneCall className="h-4 w-4" />
              Test call
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAction(onDisable);
              }}
              className="hover:text-black mt-2 flex w-full cursor-pointer items-center gap-2 text-red-600 hover:font-medium text-left"
            >
              <Power className="h-4 w-4" />
              Disable
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function AgentsClient({ agents: initialAgents }: AgentsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Connected" | "Issues">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("default");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const handleTestCall = () => {
    setToastMessage("Test call coming soon");
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleDisable = async (agentId: string, agentName: string) => {
    if (window.confirm(`Disable agent "${agentName}"?`)) {
      // TODO: Implement disable action with backend support
      // Check if agents table has a 'disabled' or 'is_active' field
      // If yes, update it. If no, show message.
      setToastMessage("Disable requires backend support");
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  return (
    <>
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-md bg-brand-500 text-white px-4 py-2 text-sm shadow-lg">
          {toastMessage}
        </div>
      )}

      {initialAgents.length === 0 ? (
        <div className="rounded-md border bg-white p-6 text-sm text-gray-700 dark:bg-navy-800 dark:text-white">
          No agents found yet.
        </div>
      ) : (
        <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="w-full h-full sm:overflow-auto px-6">
            <div className="relative flex items-center justify-between pt-4">
              <div className="text-xl font-bold text-navy-700 dark:text-white">Agents</div>
              <div className="flex items-center gap-2">
                {/* Compact search */}
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-36 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                />
                {/* Status filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                >
                  <option value="all">All Status</option>
                  <option value="Connected">Connected</option>
                  <option value="Issues">Issues</option>
                </select>
                {/* Language filter */}
                <select
                  value={languageFilter}
                  onChange={(e) => setLanguageFilter(e.target.value)}
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                >
                  <option value="all">All Languages</option>
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-white/20 dark:bg-navy-700 dark:text-white"
                >
                  <option value="default">Issues first</option>
                  <option value="last-activity">Last activity</option>
                  <option value="name-asc">Name A→Z</option>
                </select>
              </div>
            </div>
            <div className="mt-8 overflow-x-scroll xl:overflow-x-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="!border-px !border-gray-200 dark:!border-white/20">
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">NAME</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">LANGUAGE</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">STATUS</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">LIVE</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-start">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">LAST ACTIVITY</p>
                    </th>
                    <th className="border-b-[1px] border-gray-200 dark:border-white/20 pt-4 pb-2 pr-4 text-right">
                      <p className="text-xs font-bold text-gray-600 dark:text-white">ACTIONS</p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No agents match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map((agent) => {
                      // Status badge class matching original
                      let statusClass = "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
                      if (agent.status === "Connected") {
                        statusClass = "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200";
                      } else {
                        statusClass = "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-200";
                      }

                      // Safe date handling: last_call_at is string | null
                      const lastCallAtDisplay = timeAgoLabel(agent.last_call_at);
                      const lastCallAtTooltip = formatAbsoluteTime(agent.last_call_at);

                      return (
                        <tr key={agent.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`/dashboard/agents/${agent.id}`} className="block group">
                              <p className="text-sm font-bold text-navy-700 dark:text-white group-hover:underline">
                                {agent.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {maskPhone(agent.inbound_phone)}
                              </p>
                            </Link>
                          </td>
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`/dashboard/agents/${agent.id}`} className="block" tabIndex={-1}>
                              <p className="text-sm font-bold text-navy-700 dark:text-white">
                                {agent.language ?? "—"}
                              </p>
                            </Link>
                          </td>
                          <td className="min-w-[150px] border-white/0 py-3 pr-4">
                            <Link href={`/dashboard/agents/${agent.id}`} className="block" tabIndex={-1}>
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}
                              >
                                {agent.status}
                              </span>
                            </Link>
                          </td>
                          <td className="min-w-[100px] border-white/0 py-3 pr-4">
                            <p
                              className={`text-sm font-bold text-navy-700 dark:text-white ${
                                agent.active_calls >= agent.plan_limit
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : ""
                              }`}
                            >
                              {agent.active_calls} / {agent.plan_limit}
                            </p>
                          </td>
                          <td className="min-w-[120px] border-white/0 py-3 pr-4">
                            <p
                              className="text-sm font-bold text-navy-700 dark:text-white"
                              title={lastCallAtTooltip}
                            >
                              {lastCallAtDisplay}
                            </p>
                          </td>
                          <td className="min-w-[80px] border-white/0 py-3 pr-4 text-right">
                            <AgentActionsMenu
                              agentId={agent.id}
                              agentName={agent.name}
                              onDetails={() => router.push(`/dashboard/agents/${agent.id}`)}
                              onEdit={() => {
                                setToastMessage("Edit coming soon");
                                setTimeout(() => setToastMessage(null), 3000);
                              }}
                              onTestCall={handleTestCall}
                              onDisable={() => handleDisable(agent.id, agent.name)}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

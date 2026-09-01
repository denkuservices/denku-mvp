import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BadgeCheck,
  Contact as ContactIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { listContactViews } from "@/lib/platform/readModel/contacts";
import Avatar from "../../_platform/Avatar";
import ChannelBadge from "../../_platform/ChannelBadge";
import CrmMetricCard from "../../_platform/crm/CrmMetricCard";
import { formatWhen, titleCase } from "../../_platform/format";
import { lifecycleMeta, LIFECYCLE_STAGES } from "@/lib/platform/lifecycle";
import { EmptyState, Pill, SearchField } from "../../_platform/ui";

export const dynamic = "force-dynamic";

const SCAN_LIMIT = 500;

function one(v: string | string[] | undefined): string {
  if (!v) return "";
  return (Array.isArray(v) ? v[0] : v).trim();
}

function sourceLabel(source: string | null): string {
  if (!source) return "Direct";
  return titleCase(source.replace(/_/g, " "));
}

/** Contacts — a dense, scan-friendly customer workspace rather than a loose list of names. */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const sp = searchParams ? await searchParams : undefined;
  const rawSearch = one(sp?.q);
  const search = rawSearch.toLowerCase();
  const stageParam = one(sp?.stage);
  const stage = LIFECYCLE_STAGES.includes(stageParam as (typeof LIFECYCLE_STAGES)[number])
    ? stageParam
    : "";

  const orgId = await resolveActiveOrgId();
  const all = orgId ? await listContactViews(orgId, { limit: SCAN_LIMIT }) : [];
  const bounded = all.length >= SCAN_LIMIT;
  const recentCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const contacts = all.filter((contact) => {
    if (stage && contact.status !== stage) return false;
    if (!search) return true;
    return [contact.displayName, contact.primaryHandle, contact.source, contact.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search);
  });

  const countFor = (value: string) => all.filter((contact) => contact.status === value).length;
  const qualified = countFor("qualified");
  const newLeads = countFor("new");
  const activeRecently = all.filter((contact) => {
    const lastSeen = Date.parse(contact.lastSeenAt ?? "");
    return Number.isFinite(lastSeen) && lastSeen >= recentCutoff;
  }).length;

  const hrefForStage = (nextStage: string) => {
    const params = new URLSearchParams();
    if (rawSearch) params.set("q", rawSearch);
    if (nextStage) params.set("stage", nextStage);
    const query = params.toString();
    return `/dashboard/crm/contacts${query ? `?${query}` : ""}`;
  };

  const stageFilters = [
    { label: "All contacts", value: "", count: all.length },
    { label: "New", value: "new", count: newLeads },
    { label: "Contacted", value: "contacted", count: countFor("contacted") },
    { label: "Qualified", value: "qualified", count: qualified },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
            <Sparkles className="h-3.5 w-3.5" /> Customer intelligence
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white md:text-3xl">
            Contacts
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Every customer, channel and lifecycle signal in one place — automatically enriched by your AI team.
          </p>
        </div>
        <Link
          href="/dashboard/crm/contacts/new"
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-navy-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-600 hover:shadow-md dark:bg-white dark:text-navy-900 dark:hover:bg-brand-200"
        >
          <Plus className="h-4 w-4" /> Add contact
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CrmMetricCard label="Total contacts" value={`${all.length}${bounded ? "+" : ""}`} detail="Unified customer records" icon={UsersRound} tone="violet" />
        <CrmMetricCard label="Qualified" value={qualified} detail={`${all.length ? Math.round((qualified / all.length) * 100) : 0}% of your CRM`} icon={BadgeCheck} tone="teal" />
        <CrmMetricCard label="New leads" value={newLeads} detail="Waiting for follow-up" icon={Sparkles} tone="amber" />
        <CrmMetricCard label="Active this week" value={activeRecently} detail="Touched in the last 7 days" icon={Activity} tone="sky" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-navy-800">
        <div className="border-b border-gray-100 p-4 dark:border-white/10">
          <form method="get" className="flex flex-col gap-3 xl:flex-row xl:items-center">
            {stage ? <input type="hidden" name="stage" value={stage} /> : null}
            <SearchField className="min-w-[240px] flex-1" defaultValue={rawSearch} placeholder="Search name, phone, email, source…" label="Search contacts" />
            <button type="submit" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600">
              <Search className="h-4 w-4" /> Search
            </button>
            {search || stage ? (
              <Link href="/dashboard/crm/contacts" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5">
                Clear
              </Link>
            ) : null}
          </form>

          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-0.5">
            <SlidersHorizontal className="mr-1 h-4 w-4 shrink-0 text-gray-400" />
            {stageFilters.map((item) => {
              const active = stage === item.value;
              return (
                <Link key={item.label} href={hrefForStage(item.value)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${active ? "bg-navy-700 text-white shadow-sm dark:bg-white dark:text-navy-900" : "bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-navy-700 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"}`}>
                  {item.label}
                  <span className={active ? "text-white/65 dark:text-navy-500" : "text-gray-400"}>{item.count}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
          <p className="text-sm font-semibold text-navy-700 dark:text-white">
            {contacts.length === 0 ? "No matching contacts" : `${contacts.length}${bounded && !search ? "+" : ""} contact${contacts.length === 1 ? "" : "s"}`}
          </p>
          {bounded && !search ? <Pill tone="neutral">Most recent {SCAN_LIMIT}</Pill> : <span className="text-xs text-gray-400">Sorted by recent activity</span>}
        </div>

        {contacts.length === 0 ? (
          search || stage ? (
            <EmptyState icon={Search} title="No contacts match these filters" description="Try a different name or clear the lifecycle filter." action={{ label: "Clear filters", href: "/dashboard/crm/contacts" }} />
          ) : (
            <EmptyState icon={ContactIcon} title="No contacts yet" description="Every person your AI Employees speak with is saved here automatically, with their history across every channel." action={{ label: "View conversations", href: "/dashboard/inbox" }} />
          )
        ) : (
          <div>
            <div className="hidden grid-cols-[minmax(260px,1.5fr)_minmax(130px,.6fr)_minmax(130px,.65fr)_minmax(140px,.7fr)_28px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-white/10 dark:bg-white/[0.025] md:grid">
              <span>Contact</span><span>Lifecycle</span><span>Source</span><span>Last activity</span><span />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {contacts.map((contact) => {
                const lifecycle = lifecycleMeta(contact.status);
                return (
                  <Link key={contact.id} href={`/dashboard/crm/contacts/${contact.id}`} className="group grid gap-3 px-4 py-4 transition hover:bg-brand-50/50 dark:hover:bg-white/[0.035] md:grid-cols-[minmax(260px,1.5fr)_minmax(130px,.6fr)_minmax(130px,.65fr)_minmax(140px,.7fr)_28px] md:items-center md:gap-4 md:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={contact.displayName} seed={contact.primaryHandle || contact.id} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">{contact.displayName || contact.primaryHandle || "Unknown contact"}</p>
                          <div className="flex items-center -space-x-1">
                            {contact.channels.map((channel) => <ChannelBadge key={channel} channel={channel} compact className="ring-2 ring-white dark:ring-navy-800" />)}
                          </div>
                        </div>
                        {contact.primaryHandle && contact.displayName ? <p className="mt-0.5 truncate text-xs text-gray-500">{contact.primaryHandle}</p> : <p className="mt-0.5 text-xs text-gray-400">No contact details</p>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:hidden">Lifecycle</span>
                      {lifecycle ? <Pill tone={lifecycle.tone}>{lifecycle.label}</Pill> : <span className="text-xs text-gray-400">Not set</span>}
                    </div>
                    <div className="hidden text-sm text-gray-600 dark:text-gray-300 md:block">{sourceLabel(contact.source)}</div>
                    <div className="flex items-center justify-between md:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 md:hidden">Last activity</span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatWhen(contact.lastSeenAt)}</span>
                    </div>
                    <ArrowUpRight className="hidden h-4 w-4 text-gray-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-500 md:block" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

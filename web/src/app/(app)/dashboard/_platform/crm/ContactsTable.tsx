"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  PhoneCall,
  Timer,
  X,
} from "lucide-react";
import Avatar from "../Avatar";
import ChannelBadge from "../ChannelBadge";
import { Pill } from "../ui";
import { formatWhen, titleCase } from "../format";
import { lifecycleMeta, LIFECYCLE_STAGES, LIFECYCLE } from "@/lib/platform/lifecycle";
import { setContactLifecycleAction } from "@/app/(app)/dashboard/crm/_actions";
import type { ContactRow } from "@/lib/platform/crm/contactRows";

/**
 * The Contacts table.
 *
 * The old list rendered four columns of which one carried information: a name. Lifecycle was
 * mostly "Not set", source was mostly one word, and the rest was a date — so a screen with eleven
 * real people in it read as a single column, which is exactly what it was told to look like.
 *
 * What changed is not decoration. Each row now shows the work attached to that person — requests
 * still open, the next appointment, how many calls and how long they have talked — every value of
 * it read from rows that already existed and were already linked, and none of it visible anywhere
 * on this screen before.
 *
 * Three behaviours make it a workspace rather than a report:
 *
 *   * **Selection and a bulk lifecycle change.** Moving twelve people from New to Contacted is the
 *     single most common thing anybody does on a CRM list, and it was twelve page loads.
 *   * **A peek panel.** Clicking a row opens the person beside the list instead of navigating away
 *     from it, because the reason you are scanning a list is to compare rows.
 *   * **Quick actions on hover** — call, email — since a phone number that cannot be dialled from
 *     the screen it appears on is a string, not a contact detail.
 *
 * The peek reads entirely from rows the server already sent. No fetch, no spinner, no second
 * source of truth to drift.
 */

function initialsHandle(row: ContactRow): string {
  return row.displayName || row.primaryHandle || "Unknown contact";
}

function talkLabel(seconds: number): string {
  if (seconds <= 0) return "—";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function telHref(handle: string | null): string | null {
  if (!handle) return null;
  return /^[+0-9 ()-]{6,}$/.test(handle) ? `tel:${handle.replace(/\s+/g, "")}` : null;
}

function mailHref(handle: string | null): string | null {
  if (!handle) return null;
  return handle.includes("@") ? `mailto:${handle}` : null;
}

/**
 * The columns, as one shared grid so the header and every row cannot drift apart.
 *
 * Written out twice, literally, rather than composed with a template string: Tailwind generates
 * classes by SCANNING the source, so an interpolated `lg:${GRID}` yields the right string at
 * runtime and no stylesheet rule at all.
 */
const GRID_HEADER =
  "grid-cols-[28px_minmax(220px,1.6fr)_minmax(104px,.55fr)_minmax(96px,.5fr)_minmax(132px,.7fr)_minmax(92px,.45fr)_minmax(116px,.6fr)_32px]";
const GRID_ROW =
  "lg:grid-cols-[28px_minmax(220px,1.6fr)_minmax(104px,.55fr)_minmax(96px,.5fr)_minmax(132px,.7fr)_minmax(92px,.45fr)_minmax(116px,.6fr)_32px]";

export default function ContactsTable({
  rows,
  canSelect = true,
}: {
  rows: ContactRow[];
  canSelect?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);

  const peek = useMemo(() => rows.find((r) => r.id === peekId) ?? null, [rows, peekId]);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));

  /**
   * Move every selected contact to a stage.
   *
   * Sequential rather than parallel: these are writes against the same table for the same org, and
   * a burst of twenty concurrent updates buys nothing a person would notice while making a partial
   * failure much harder to describe. If one fails the rest still land, and the message says so.
   */
  const applyStage = (stage: string) => {
    setBulkError(null);
    const ids = [...selected];
    startTransition(async () => {
      let failed = 0;
      for (const id of ids) {
        const result = await setContactLifecycleAction(id, stage);
        if (!result.ok) failed += 1;
      }
      if (failed > 0) {
        setBulkError(
          failed === ids.length
            ? "None of those could be updated. Please try again."
            : `${ids.length - failed} updated, ${failed} could not be. Please try the rest again.`
        );
      } else {
        setSelected(new Set());
      }
      router.refresh();
    });
  };

  return (
    <div className="relative">
      {/* ------------------------------------------------------------ bulk bar */}
      {canSelect && selected.size > 0 ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-brand-200 bg-brand-50/95 px-4 py-2.5 backdrop-blur dark:border-brand-400/20 dark:bg-brand-500/10">
          <span className="text-sm font-semibold text-navy-700 dark:text-white">
            {selected.size} selected
          </span>
          <span className="text-xs text-gray-500">Move to</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {LIFECYCLE_STAGES.map((stage) => (
              <button
                key={stage}
                type="button"
                disabled={isPending}
                onClick={() => applyStage(stage)}
                title={LIFECYCLE[stage].description}
                className="inline-flex h-7 items-center rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-navy-700 transition hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-white/10 dark:bg-navy-800 dark:text-white"
              >
                {LIFECYCLE[stage].label}
              </button>
            ))}
          </div>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> : null}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-navy-700 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
          {bulkError ? (
            <p className="w-full text-xs font-medium text-red-600 dark:text-red-300">{bulkError}</p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------- header */}
      <div
        className={`hidden ${GRID_HEADER} gap-4 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:border-white/10 dark:bg-white/[0.025] lg:grid`}
      >
        <span>
          {canSelect ? (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select every contact on this page"
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
          ) : null}
        </span>
        <span>Contact</span>
        <span>Lifecycle</span>
        <span>Open</span>
        <span>Next appointment</span>
        <span>Calls</span>
        <span>Last activity</span>
        <span />
      </div>

      {/* --------------------------------------------------------------- rows */}
      <div className="divide-y divide-gray-100 dark:divide-white/10">
        {rows.map((row) => {
          const lifecycle = lifecycleMeta(row.status);
          const isSelected = selected.has(row.id);
          const tel = telHref(row.primaryHandle);
          const mail = mailHref(row.primaryHandle);
          const open = row.insight.openRequests;

          return (
            <div
              key={row.id}
              className={`group relative grid gap-3 px-4 py-3.5 transition ${GRID_ROW} lg:items-center lg:gap-4 ${
                isSelected
                  ? "bg-brand-50/60 dark:bg-brand-500/10"
                  : "hover:bg-gray-50/80 dark:hover:bg-white/[0.035]"
              }`}
            >
              <div className="hidden lg:block">
                {canSelect ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(row.id)}
                    aria-label={`Select ${initialsHandle(row)}`}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                ) : null}
              </div>

              {/* The name cell is the click target for the peek — the rest of the row is not, so
                  selecting a checkbox or dialling a number never opens a panel by accident. */}
              <button
                type="button"
                onClick={() => setPeekId(row.id)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <Avatar name={row.displayName} seed={row.primaryHandle || row.id} size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-navy-700 dark:text-white">
                      {initialsHandle(row)}
                    </p>
                    <div className="flex items-center -space-x-1">
                      {row.channels.map((channel) => (
                        <ChannelBadge
                          key={channel}
                          channel={channel}
                          compact
                          className="ring-2 ring-white dark:ring-navy-800"
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {row.primaryHandle || "No contact details"}
                    {row.source ? (
                      <span className="text-gray-400"> · {titleCase(row.source.replace(/_/g, " "))}</span>
                    ) : null}
                  </p>
                </div>
              </button>

              <div className="flex items-center justify-between lg:block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 lg:hidden">
                  Lifecycle
                </span>
                {lifecycle ? (
                  <Pill tone={lifecycle.tone}>{lifecycle.label}</Pill>
                ) : (
                  <span className="text-xs text-gray-400">Not set</span>
                )}
              </div>

              <div className="flex items-center justify-between lg:block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 lg:hidden">
                  Open requests
                </span>
                {open > 0 ? (
                  <Link
                    href={`/dashboard/crm/requests?contact=${row.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300"
                  >
                    <Inbox className="h-3.5 w-3.5" />
                    {open}
                  </Link>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                )}
              </div>

              <div className="flex items-center justify-between lg:block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 lg:hidden">
                  Next appointment
                </span>
                {row.insight.nextAppointmentAt ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-navy-700 dark:text-white">
                    <CalendarClock className="h-3.5 w-3.5 text-brand-500" />
                    {formatWhen(row.insight.nextAppointmentAt)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                )}
              </div>

              <div className="flex items-center justify-between lg:block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 lg:hidden">
                  Calls
                </span>
                {row.insight.calls > 0 ? (
                  <span
                    className="text-xs font-medium text-gray-600 dark:text-gray-300"
                    title={`${talkLabel(row.insight.talkSeconds)} of talk time`}
                  >
                    {row.insight.calls}
                    <span className="ml-1 text-gray-400">· {talkLabel(row.insight.talkSeconds)}</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                )}
              </div>

              <div className="flex items-center justify-between lg:block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 lg:hidden">
                  Last activity
                </span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {formatWhen(row.lastSeenAt)}
                </span>
              </div>

              {/* Quick actions, revealed on hover; always present for keyboard and touch. */}
              <div className="flex items-center justify-end gap-0.5 lg:opacity-0 lg:transition lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                {tel ? (
                  <a
                    href={tel}
                    title={`Call ${row.primaryHandle}`}
                    aria-label={`Call ${initialsHandle(row)}`}
                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-brand-600 dark:hover:bg-white/10"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </a>
                ) : null}
                {mail ? (
                  <a
                    href={mail}
                    title={`Email ${row.primaryHandle}`}
                    aria-label={`Email ${initialsHandle(row)}`}
                    className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-brand-600 dark:hover:bg-white/10"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                ) : null}
                <Link
                  href={`/dashboard/crm/contacts/${row.id}`}
                  title="Open full profile"
                  aria-label={`Open ${initialsHandle(row)}`}
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-brand-600 dark:hover:bg-white/10"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- peek panel */}
      {peek ? (
        <>
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setPeekId(null)}
            className="fixed inset-0 z-40 bg-navy-900/20 backdrop-blur-[2px] dark:bg-black/40"
          />
          <aside
            role="dialog"
            aria-label={`${initialsHandle(peek)} preview`}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[400px] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-800"
          >
            <header className="flex items-start gap-3 border-b border-gray-100 p-5 dark:border-white/10">
              <Avatar name={peek.displayName} seed={peek.primaryHandle || peek.id} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-navy-700 dark:text-white">
                  {initialsHandle(peek)}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {peek.primaryHandle || "No contact details"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {lifecycleMeta(peek.status) ? (
                    <Pill tone={lifecycleMeta(peek.status)!.tone}>
                      {lifecycleMeta(peek.status)!.label}
                    </Pill>
                  ) : null}
                  {peek.channels.map((c) => (
                    <ChannelBadge key={c} channel={c} compact />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPeekId(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-navy-700 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="grid grid-cols-2 gap-px bg-gray-100 dark:bg-white/10">
              <PeekStat
                icon={Inbox}
                label="Open requests"
                value={peek.insight.openRequests}
                hint={`${peek.insight.totalRequests} in total`}
              />
              <PeekStat
                icon={MessageSquare}
                label="Calls"
                value={peek.insight.calls}
                hint={talkLabel(peek.insight.talkSeconds)}
              />
              <PeekStat
                icon={CalendarClock}
                label="Next appointment"
                value={peek.insight.nextAppointmentAt ? formatWhen(peek.insight.nextAppointmentAt) : "—"}
                hint={
                  peek.insight.pastAppointments > 0
                    ? `${peek.insight.pastAppointments} already held`
                    : "None held yet"
                }
              />
              <PeekStat
                icon={Timer}
                label="Last activity"
                value={formatWhen(peek.lastSeenAt)}
                hint={peek.source ? titleCase(peek.source.replace(/_/g, " ")) : "Direct"}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                Move to
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {LIFECYCLE_STAGES.map((stage) => {
                  const active = peek.status === stage;
                  return (
                    <button
                      key={stage}
                      type="button"
                      disabled={isPending || active}
                      title={LIFECYCLE[stage].description}
                      onClick={() =>
                        startTransition(async () => {
                          await setContactLifecycleAction(peek.id, stage);
                          router.refresh();
                        })
                      }
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                          : "border-gray-200 text-navy-700 hover:border-brand-400 hover:text-brand-600 disabled:opacity-50 dark:border-white/10 dark:text-white"
                      }`}
                    >
                      {active ? <Check className="h-3.5 w-3.5" /> : null}
                      {LIFECYCLE[stage].label}
                    </button>
                  );
                })}
              </div>

              <p className="mt-6 text-xs text-gray-500">
                {LIFECYCLE_STAGES.includes((peek.status ?? "") as (typeof LIFECYCLE_STAGES)[number])
                  ? LIFECYCLE[peek.status as (typeof LIFECYCLE_STAGES)[number]].description
                  : "This contact has no lifecycle stage yet."}
              </p>
            </div>

            <footer className="flex items-center gap-2 border-t border-gray-100 p-4 dark:border-white/10">
              <Link
                href={`/dashboard/crm/contacts/${peek.id}`}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-navy-700 text-sm font-semibold text-white transition hover:bg-brand-600 dark:bg-white dark:text-navy-900"
              >
                Open full profile <ChevronRight className="h-4 w-4" />
              </Link>
              {telHref(peek.primaryHandle) ? (
                <a
                  href={telHref(peek.primaryHandle)!}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:text-brand-600 dark:border-white/10"
                  aria-label="Call"
                >
                  <PhoneCall className="h-4 w-4" />
                </a>
              ) : null}
            </footer>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function PeekStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  hint: string;
}) {
  return (
    <div className="bg-white p-4 dark:bg-navy-800">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-navy-700 dark:text-white">{value}</p>
      <p className="truncate text-xs text-gray-400">{hint}</p>
    </div>
  );
}

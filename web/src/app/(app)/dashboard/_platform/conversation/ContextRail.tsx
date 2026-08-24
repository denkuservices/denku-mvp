import React from "react";
import Link from "next/link";
import { Ticket, Calendar, Phone, ArrowUpRight } from "lucide-react";
import type { ConversationDetailView } from "@/lib/platform/readModel/types";
import type { HandlingState } from "@/lib/platform/handling";
import { formatWhen, titleCase } from "../format";
import ChannelBadge from "../ChannelBadge";
import HandlingControl from "./HandlingControl";

/**
 * Customer context rail (Phase 3) — the right-hand column of the Inbox.
 *
 * This is what makes the Inbox and the CRM feel like two views of one relationship rather than
 * two apps: the same contact identity, the same open artifacts, the same lifecycle, reachable
 * from whichever side you happen to be standing on.
 *
 * Rule: **the rail shows nothing it cannot source.** No lead score, no AI summary, no "last seen
 * on 4 channels" until the data behind it exists (CRM v1, Phase 4). An empty section is honest;
 * a plausible-looking invented one is not.
 */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-navy-800">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {children}
    </div>
  );
}

export default function ContextRail({
  detail,
  handling,
  handlingAvailable,
}: {
  detail: ConversationDetailView;
  handling: HandlingState;
  handlingAvailable: boolean;
}) {
  const contactName = detail.contact.displayName || detail.contact.handle || "Unknown contact";

  return (
    <aside className="space-y-4">
      {/* Who — the bridge into the CRM. */}
      <Card title="Customer">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-700 dark:text-white">{contactName}</p>
            {detail.contact.handle && detail.contact.displayName ? (
              <p className="mt-0.5 truncate text-sm text-gray-500">{detail.contact.handle}</p>
            ) : null}
          </div>
          <ChannelBadge channel={detail.channel} />
        </div>

        {detail.contact.id ? (
          <Link
            href={`/dashboard/crm/contacts/${detail.contact.id}`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 transition hover:underline dark:text-brand-300"
          >
            View full history <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          // Honest about the gap rather than rendering a dead link: voice calls from an unknown
          // number have no contact record until one is created.
          <p className="mt-3 text-xs text-gray-500">
            No contact record linked to this conversation yet.
          </p>
        )}
      </Card>

      {/* Who owns it right now. */}
      <HandlingControl
        conversationRef={detail.id}
        source={detail.source}
        channel={detail.channel}
        handling={handling.handling}
        automationOptedOut={handling.automationOptedOut}
        available={handlingAvailable}
      />

      {/* What came out of it. */}
      <Card title="Outcomes">
        {detail.artifacts.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing was created from this conversation.</p>
        ) : (
          <ul className="space-y-2">
            {detail.artifacts.map((a) => (
              <li key={`${a.type}:${a.id}`}>
                <Link
                  href={a.type === "ticket" ? `/dashboard/tickets/${a.id}` : "/dashboard/crm/requests?type=appointment"}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 p-2 text-sm transition hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                >
                  {a.type === "ticket" ? (
                    <Ticket className="h-4 w-4 shrink-0 text-gray-500" />
                  ) : (
                    <Calendar className="h-4 w-4 shrink-0 text-gray-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-navy-700 dark:text-white">
                    {a.title || titleCase(a.type)}
                  </span>
                  {a.status ? <span className="shrink-0 text-xs text-gray-400">{titleCase(a.status)}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Facts we actually hold. */}
      <Card title="Details">
        <dl className="space-y-2 text-sm">
          {detail.employeeName ? (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Handled by</dt>
              <dd className="min-w-0 truncate font-medium text-navy-700 dark:text-white">{detail.employeeName}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Started</dt>
            <dd className="text-navy-700 dark:text-white">{formatWhen(detail.startedAt)}</dd>
          </div>
          {detail.lastActivityAt ? (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Last activity</dt>
              <dd className="text-navy-700 dark:text-white">{formatWhen(detail.lastActivityAt)}</dd>
            </div>
          ) : null}
          {detail.intent ? (
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Outcome</dt>
              <dd className="text-navy-700 dark:text-white">{titleCase(detail.intent)}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {/* Voice keeps its rich detail page — linked, never duplicated. */}
      {detail.channel === "voice" ? (
        <Link
          href={`/dashboard/calls/${detail.id}`}
          className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm font-medium text-brand-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-brand-300 dark:hover:bg-white/5"
        >
          <Phone className="h-4 w-4" />
          Recording &amp; cost details
          <ArrowUpRight className="ml-auto h-3.5 w-3.5" />
        </Link>
      ) : null}
    </aside>
  );
}

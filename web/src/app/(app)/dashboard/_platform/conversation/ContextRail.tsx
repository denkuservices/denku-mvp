import React from "react";
import Link from "next/link";
import { Ticket, Calendar, ArrowUpRight } from "lucide-react";
import type { ConversationDetailView } from "@/lib/platform/readModel/types";
import { requestHref } from "@/lib/platform/readModel/requests";
import type { HandlingState } from "@/lib/platform/handling";
import type { VoiceArtifacts } from "@/lib/platform/readModel/voiceArtifacts";
import { billableMinutesForCall } from "@/lib/billing/usageMath";
import { formatWhen, titleCase } from "../format";
import Avatar from "../Avatar";
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
  voice,
}: {
  detail: ConversationDetailView;
  handling: HandlingState;
  handlingAvailable: boolean;
  /** Recording + cost for voice conversations; null for other channels or when unavailable. */
  voice?: VoiceArtifacts | null;
}) {
  const contactName = detail.contact.displayName || detail.contact.handle || "Unknown contact";

  return (
    <aside className="space-y-4">
      {/* Who — the bridge into the CRM. */}
      <Card title="Customer">
        <div className="flex items-start gap-3">
          {/* The same avatar the Inbox and Customers rows use, one size up: arriving here from
              either list, the person you clicked is still recognisably the person you clicked. */}
          <Avatar name={detail.contact.displayName} seed={detail.contact.handle || detail.id} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-navy-700 dark:text-white">{contactName}</p>
            {detail.contact.handle && detail.contact.displayName ? (
              <p className="mt-0.5 truncate text-sm text-gray-500">{detail.contact.handle}</p>
            ) : null}
          </div>
          <ChannelBadge channel={detail.channel} compact />
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
                  href={requestHref(a.type === "ticket" ? "ticket" : "appointment", a.id)}
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

      {/* Sprint 13: the recording plays here rather than on a separate, legacy-styled page.
          Hearing the call was the one thing the thread could not do on its own. */}
      {detail.channel === "voice" && voice ? (
        <Card title="Recording">
          {voice.playbackUrl ? (
            <audio controls preload="none" className="w-full">
              {/* Same-origin route, not the Vapi URL: recording storage is access-controlled and
                  the private key that unlocks it must stay on the server. */}
              <source src={voice.playbackUrl} />
              Your browser can&apos;t play this recording.
            </audio>
          ) : (
            <p className="text-sm text-gray-500">No recording was captured for this call.</p>
          )}

          <dl className="mt-3 space-y-2 border-t border-gray-100 pt-3 text-sm dark:border-white/10">
            {voice.durationSeconds != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Duration</dt>
                <dd className="tabular-nums text-navy-700 dark:text-white">
                  {formatDuration(voice.durationSeconds)}
                </dd>
              </div>
            ) : null}
            {/*
              This row used to render `calls.cost_usd` as "Cost".

              That column is **COGS — what Denku pays Vapi for the call** (see
              `lib/billing/reconciliation.ts`), not what the customer is charged. Showing it to
              them published our margin on every conversation and, worse, was wrong: a 25-second
              call showed "$0.07" while the customer is billed a whole minute at their plan rate.

              What they can act on is how the call counted against their allowance, and the rule
              is the one the billing page already explains — every call rounds up to the next
              minute (`billable_minutes = Σ ceil(duration_seconds/60)`, the golden master).
            */}
            {voice.durationSeconds != null ? (
              <div className="flex justify-between gap-2">
                <dt className="text-gray-500">Billed as</dt>
                <dd className="tabular-nums text-navy-700 dark:text-white">
                  {billableMinutesForCall(voice.durationSeconds)} min
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}
    </aside>
  );
}

/** m:ss, or h:mm:ss past an hour. */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

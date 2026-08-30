'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, AlertTriangle, AlertCircle, MessageSquare, Loader2 } from 'lucide-react';
import { loadAttentionAction } from '@/app/(app)/dashboard/_actions/topbar';
import type { AttentionFeed, AttentionItem } from '@/lib/platform/readModel/attentionTypes';

/**
 * The notification bell.
 *
 * **It shows derived state, not a message log.** Denku has no in-app notifications table, so
 * rather than a bell that stays empty until someone builds one, this reads the four things the
 * product can already prove: the workspace is paused, usage is near the plan's limit,
 * conversations were handed to a person, conversations are unread (see `readModel/attention.ts`).
 * Two consequences show up in this component: there is no "mark all read" — there is nothing
 * persisted to mark — and an item leaves the list when the state behind it clears.
 *
 * **The feed is cached at module scope for a minute.** The badge has to be right before anyone
 * opens the bell, which means fetching on mount — on a shell that mounts on every dashboard
 * page. Caching across client navigations turns "one query set per page view" into "one per
 * minute per tab"; opening the bell always refetches, because that is the moment accuracy is
 * actually being looked at.
 */

const CACHE_TTL_MS = 60_000;

let cached: { at: number; feed: AttentionFeed } | null = null;

const EMPTY: AttentionFeed = { items: [], count: 0 };

const ICONS = {
  workspace_paused: AlertCircle,
  usage: AlertTriangle,
  needs_person: AlertTriangle,
  unread: MessageSquare,
} as const;

const TONES = {
  critical: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-brand-500',
} as const;

/** "3h", "2d" — a timestamp is context here, not information, so it stays tiny. */
function shortAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<AttentionFeed>(cached?.feed ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** Set once the component unmounts, so a late response never sets state on a dead component. */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (force: boolean) => {
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      setFeed(cached.feed);
      return;
    }
    setLoading(true);
    try {
      const next = await loadAttentionAction();
      cached = { at: Date.now(), feed: next };
      if (alive.current) setFeed(next);
    } catch {
      /* A bell that cannot load is a quiet bell, never an error on top of the page. */
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  // Badge accuracy before anyone clicks — deferred so it never competes with the page's own data.
  useEffect(() => {
    const timer = setTimeout(() => void load(false), 400);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load(true);
  }

  const count = feed.count;

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Notifications, ${count} need attention` : 'Notifications'}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-white/70 dark:hover:bg-white/10"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-[9999] w-[min(92vw,360px)] overflow-hidden rounded-[20px] bg-white shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none"
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-bold text-navy-700 dark:text-white">Needs your attention</p>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />}
          </div>

          <div className="max-h-[min(60vh,400px)] overflow-y-auto">
            {feed.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-white/60">
                {loading ? 'Checking...' : 'Nothing needs you right now.'}
              </p>
            ) : (
              feed.items.map((item) => <Row key={item.id} item={item} onGo={() => setOpen(false)} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ item, onGo }: { item: AttentionItem; onGo: () => void }) {
  const Icon = ICONS[item.kind];
  const when = shortAgo(item.at);

  return (
    <Link
      href={item.href}
      onClick={onGo}
      className="flex items-start gap-3 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-navy-800/60"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONES[item.severity]}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-navy-700 dark:text-white">{item.title}</span>
        {item.body && (
          <span className="mt-0.5 block text-xs leading-snug text-gray-500 dark:text-white/60">
            {item.body}
          </span>
        )}
      </span>
      {when && (
        <span className="shrink-0 pt-0.5 text-[11px] text-gray-400 dark:text-white/40">{when}</span>
      )}
    </Link>
  );
}

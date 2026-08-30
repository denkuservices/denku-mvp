'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, MessageSquare, User, ClipboardList } from 'lucide-react';
import { searchWorkspaceAction } from '@/app/(app)/dashboard/_actions/topbar';
import {
  SEARCH_MIN_LENGTH,
  type SearchHit,
  type SearchResults,
} from '@/lib/platform/readModel/searchTypes';

/**
 * Workspace search in the topbar.
 *
 * **The trigger is a button, not the input.** On a wide screen it is drawn as a filled search
 * field so it reads as one, but the real input lives in the panel it opens. That is what keeps a
 * single input — and therefore a single piece of state — across every breakpoint, instead of one
 * field in the capsule and a second one in a mobile sheet quietly disagreeing with it.
 *
 * It searches conversations, contacts and requests together (see `readModel/search.ts`) because
 * the person typing knows a customer's name, not which table it landed in. Results are grouped,
 * each row is a link, and the keyboard drives all of it: Cmd/Ctrl+K opens, arrows move, Enter
 * opens, Escape closes.
 */

const DEBOUNCE_MS = 250;

const GROUP_META: Record<
  'conversations' | 'contacts' | 'requests',
  { label: string; icon: typeof Search }
> = {
  conversations: { label: 'Conversations', icon: MessageSquare },
  contacts: { label: 'Customers', icon: User },
  requests: { label: 'Requests', icon: ClipboardList },
};

const EMPTY: SearchResults = {
  query: '',
  conversations: [],
  contacts: [],
  requests: [],
  total: 0,
};

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [active, setActive] = useState(0);
  const [isPending, startTransition] = useTransition();

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Guards against an out-of-order response overwriting a newer one: a slow search for "an"
   * must not land on top of the finished search for "anna".
   */
  const requestId = useRef(0);

  const searched = query.trim().length >= SEARCH_MIN_LENGTH;
  /**
   * What the panel shows, DERIVED rather than stored: below the minimum length the last results
   * are simply not rendered. Clearing them in an effect instead would mean a second render pass
   * for every keystroke that shortens the query, and stale rows visible until it landed.
   */
  const shown: SearchResults = searched ? results : EMPTY;

  // Flattened once — the keyboard walks one list, the panel renders three groups.
  const flat: SearchHit[] = [...shown.conversations, ...shown.contacts, ...shown.requests];

  const close = useCallback(() => {
    setOpen(false);
    setActive(0);
  }, []);

  // Click-outside, matching the account menu's behaviour.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  // Cmd/Ctrl+K from anywhere in the dashboard.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search. A query under the minimum is not searched — `shown` hides the old rows.
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_LENGTH) return;
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const next = await searchWorkspaceAction(q);
        if (id !== requestId.current) return;
        setResults(next);
        setActive(0);
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const go = useCallback(
    (hit: SearchHit) => {
      close();
      setQuery('');
      setResults(EMPTY);
      router.push(hit.href);
    },
    [close, router]
  );

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flat[active];
      if (hit) go(hit);
    }
  }

  let index = -1;

  return (
    <div className="relative" ref={wrapRef}>
      {/* Wide screens: a field-shaped trigger, matching the capsule's other controls. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hidden h-10 w-[180px] items-center gap-2 rounded-full bg-lightPrimary px-4 text-left text-sm text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:flex xl:w-[240px] dark:bg-navy-900 dark:text-white/70 dark:hover:bg-navy-900/70"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Search</span>
      </button>

      {/* Narrow screens: the same trigger as an icon, so the capsule still fits. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:hidden dark:text-white/70 dark:hover:bg-white/10"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* The panel is anchored to the trigger's RIGHT edge, and pinned to the viewport below
          `md`. The capsule sits at the right of the screen, so a panel growing rightwards from
          the search field runs off the page — which on this shell means a horizontal scroll that
          shifts the whole dashboard sideways, not a harmless overhang. Right-anchoring makes it
          grow back towards the sidebar instead. On a phone the trigger is a 40px icon near the
          right edge, where even a right-anchored 420px panel would hang off the LEFT, so there it
          stops tracking the trigger and spans the viewport with a margin. */}
      {open && (
        <div
          role="dialog"
          aria-label="Search this workspace"
          className="absolute right-0 top-12 z-[9999] w-[min(92vw,420px)] overflow-hidden rounded-[20px] bg-white shadow-xl shadow-shadow-500 max-md:fixed max-md:inset-x-4 max-md:top-[84px] max-md:w-auto dark:!bg-navy-700 dark:shadow-none"
        >
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-white/10">
            {isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search conversations, customers, requests"
              className="w-full bg-transparent text-sm text-navy-700 placeholder:text-gray-400 focus:outline-none dark:text-white"
              aria-label="Search this workspace"
              autoComplete="off"
            />
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto py-2">
            {!searched ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-white/60">
                Type at least {SEARCH_MIN_LENGTH} characters to search conversations, customers and
                requests.
              </p>
            ) : flat.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-white/60">
                {isPending ? 'Searching...' : `Nothing matches "${query.trim()}".`}
              </p>
            ) : (
              (['conversations', 'contacts', 'requests'] as const).map((key) => {
                const hits = shown[key];
                if (hits.length === 0) return null;
                const { label, icon: Icon } = GROUP_META[key];
                return (
                  <div key={key} className="mb-1">
                    <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-white/40">
                      {label}
                    </p>
                    {hits.map((hit) => {
                      index += 1;
                      const position = index;
                      const isActive = position === active;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          type="button"
                          onMouseEnter={() => setActive(position)}
                          onClick={() => go(hit)}
                          className={`flex w-full items-start gap-3 px-4 py-2 text-left transition ${
                            isActive
                              ? 'bg-lightPrimary dark:bg-navy-800'
                              : 'hover:bg-gray-50 dark:hover:bg-navy-800/60'
                          }`}
                        >
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-white/40"
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-navy-700 dark:text-white">
                              {hit.title}
                            </span>
                            {hit.subtitle && (
                              <span className="block truncate text-xs text-gray-500 dark:text-white/60">
                                {hit.subtitle}
                              </span>
                            )}
                          </span>
                          {hit.meta && (
                            <span className="shrink-0 pt-0.5 text-[11px] text-gray-400 dark:text-white/40">
                              {hit.meta}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export interface ProfileIdentity {
  /** First name for the greeting; "there" when we have nothing real to show. */
  firstName: string;
  /** 1–2 uppercase letters derived from the name, else the email; null when neither exists. */
  initials: string | null;
  /** The user's own uploaded avatar. Never a stock template image (Sprint 9 · T3). */
  avatarUrl: string | null;
}

const EMPTY: ProfileIdentity = { firstName: 'there', initials: null, avatarUrl: null };

/**
 * Deterministic initials: first letters of the first two words of a name, else the
 * first letter of the email local part. Pure so it can be unit-tested without a browser.
 */
export function deriveInitials(fullName?: string | null, email?: string | null): string | null {
  const name = (fullName ?? '').trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words
      .slice(0, 2)
      .map((w) => Array.from(w)[0])
      .filter((c): c is string => Boolean(c) && /\p{L}|\p{N}/u.test(c));
    if (letters.length > 0) return letters.join('').toUpperCase();
  }

  const local = (email ?? '').trim().split('@')[0] ?? '';
  const first = Array.from(local).find((c) => /\p{L}|\p{N}/u.test(c));
  return first ? first.toUpperCase() : null;
}

/** First word of a name, capitalised. */
export function deriveFirstName(fullName?: string | null): string {
  const name = (fullName ?? '').trim();
  if (!name) return 'there';
  const first = name.split(/\s+/)[0];
  if (!first) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/**
 * Fetches the signed-in user's display identity **once** for the whole topbar
 * (Sprint 9 · T3). Previously ProfileWidget and ProfileDropdown each ran their own
 * profile query, and the widget fell back to a stock Horizon template avatar.
 *
 * Fails soft: any error leaves the neutral defaults in place rather than throwing
 * inside the app chrome.
 */
export function useProfileIdentity(): ProfileIdentity {
  const [identity, setIdentity] = useState<ProfileIdentity>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: profiles } = await supabase
          .from('profiles')
          /**
           * `profiles` has no `avatar_url` column, and asking for one made PostgREST reject the
           * whole request with a 400 — so nobody's name or initials ever loaded in the dashboard
           * chrome. The failure was invisible because the catch below keeps the shell rendering:
           * everyone quietly got the neutral fallback instead of their own name.
           */
          .select('full_name, email')
          .eq('auth_user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (cancelled) return;

        const profile = profiles && profiles.length > 0 ? profiles[0] : null;
        const email = profile?.email ?? user.email ?? null;

        setIdentity({
          firstName: deriveFirstName(profile?.full_name),
          initials: deriveInitials(profile?.full_name, email),
          // No column to read one from. Null is the honest answer, and the shell already renders
          // initials when there is no picture.
          avatarUrl: null,
        });
      } catch {
        // Chrome must render regardless — keep the neutral defaults.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return identity;
}

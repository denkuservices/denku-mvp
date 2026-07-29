/**
 * Single source of truth for the auth-cookie policy shared by every cookie-backed
 * Supabase client (Server Components / server actions / route handlers via
 * `lib/supabase/server.ts`, and the Edge middleware via `middleware.ts`).
 *
 * WHY THIS FILE EXISTS: these two clients must agree byte-for-byte on cookie
 * attributes. Middleware refreshes the session cookie that Server Components later
 * read; if one writes `secure: true` on localhost or defaults `sameSite`/`path`
 * differently, the browser silently drops or shadows the cookie and the user gets
 * intermittent logouts. The policy previously lived in two hand-maintained copies
 * (R-133) — keep it here so it can only ever drift in one place.
 *
 * Not marked `server-only` on purpose: it reads nothing but `NEXT_PUBLIC_*` values
 * and `NODE_ENV`, holds no secrets, and must stay importable from Edge middleware.
 */
import type { CookieOptions } from "@supabase/ssr";

/**
 * Resolve the public (anon) Supabase credentials, failing fast when unset.
 * Mirrors the fail-fast contract of `lib/supabase/admin.ts`.
 */
export function resolveSupabaseAnonCredentials(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { url, anonKey };
}

/**
 * Attributes applied when WRITING an auth cookie.
 *
 * CRITICAL: `secure` must be false on localhost (http://) or the session cookie is
 * silently dropped and login appears to succeed but never persists. It is true only
 * in production (HTTPS).
 */
export function authCookieOptions(options: CookieOptions): CookieOptions {
  return {
    ...options,
    secure: process.env.NODE_ENV === "production",
    sameSite: options.sameSite ?? "lax",
    path: options.path ?? "/",
  };
}

/**
 * Attributes applied when CLEARING an auth cookie: the same write policy plus an
 * immediate expiry. Callers pair this with an empty cookie value.
 */
export function authCookieRemovalOptions(options: CookieOptions): CookieOptions {
  return { ...authCookieOptions(options), maxAge: 0 };
}

import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  resolveSupabaseAnonCredentials,
  authCookieOptions,
  authCookieRemovalOptions,
} from "@/lib/supabase/cookiePolicy";

/**
 * Cookie-backed Supabase client for Server Components, server actions and route
 * handlers. Reads the caller's session from the request cookies, so every query it
 * makes runs as the `authenticated` role under RLS.
 *
 * This is the request-scoped counterpart to `lib/supabase/admin.ts` (service role,
 * bypasses RLS). Use this one to establish who the request is; use the admin client
 * for privileged or background writes.
 *
 * Cookie attributes come from `lib/supabase/cookiePolicy.ts` so this client and the
 * Edge middleware cannot drift apart.
 */
export async function createSupabaseServerClient() {
  const { url, anonKey } = resolveSupabaseAnonCredentials();

  // IMPORTANT: In Next.js 16.1.1 / Turbopack, cookies() is async (returns Promise)
  // Also in Server Components it is read-only in types, so we cast to any.
  const cookieStore = (await cookies()) as any;

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },

      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...authCookieOptions(options) });
        } catch {
          // Server Component context -> cookie write disallowed
          // No-op (read-only pages like /dashboard are OK)
        }
      },

      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...authCookieRemovalOptions(options) });
        } catch {
          // No-op
        }
      },
    },
  });
}

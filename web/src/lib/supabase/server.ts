import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // IMPORTANT: In Next.js 16.1.1 / Turbopack, cookies() is async (returns Promise)
  // Also in Server Components it is read-only in types, so we cast to any.
  const cookieStore = (await cookies()) as any;

  const isProduction = process.env.NODE_ENV === "production";

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },

      set(name: string, value: string, options: CookieOptions) {
        try {
          // CRITICAL: Ensure cookies work on localhost (http://)
          // Secure flag must be false on localhost, true only in production (HTTPS)
          // Also ensure sameSite and path are set correctly
          const cookieOptions: CookieOptions = {
            ...options,
            secure: isProduction, // false on localhost, true in production
            sameSite: options.sameSite ?? "lax", // Default to lax if not specified
            path: options.path ?? "/", // Default to root path
          };

          cookieStore.set({ name, value, ...cookieOptions });

          // TEMP: Debug log cookie names (not values) in development only
          if (!isProduction) {
            console.log("[createSupabaseServerClient] Cookie set:", {
              name,
              hasValue: !!value,
              secure: cookieOptions.secure,
              sameSite: cookieOptions.sameSite,
              path: cookieOptions.path,
            });
          }
        } catch {
          // Server Component context -> cookie write disallowed
          // No-op (read-only pages like /dashboard are OK)
        }
      },

      remove(name: string, options: CookieOptions) {
        try {
          // Ensure cookie removal also respects secure flag for localhost
          const cookieOptions: CookieOptions = {
            ...options,
            secure: isProduction,
            sameSite: options.sameSite ?? "lax",
            path: options.path ?? "/",
          };
          cookieStore.set({ name, value: "", ...cookieOptions, maxAge: 0 });
        } catch {
          // No-op
        }
      },
    },
  });
}

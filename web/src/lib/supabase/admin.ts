import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Get or create Supabase Admin client (service role).
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 * Throws error if missing (fail fast).
 */
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    const error = new Error(
      "[SUPABASE_ADMIN] Missing NEXT_PUBLIC_SUPABASE_URL environment variable"
    );
    console.error(error.message);
    throw error;
  }

  if (!serviceRoleKey) {
    const error = new Error(
      "[SUPABASE_ADMIN] Missing SUPABASE_SERVICE_ROLE_KEY environment variable. " +
      "Required for bypassing RLS (e.g., writing to call_concurrency_leases)."
    );
    console.error(error.message);
    throw error;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

// Export singleton instance
export const supabaseAdmin = getSupabaseAdmin();

// Also export function for explicit checks
export { getSupabaseAdmin };
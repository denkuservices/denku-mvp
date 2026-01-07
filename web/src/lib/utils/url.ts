/**
 * Get the base URL for the application.
 * 
 * Priority:
 * 1. NEXT_PUBLIC_SITE_URL (explicit production URL, e.g., https://denku-mvp.vercel.app)
 * 2. VERCEL_URL (auto-detected on Vercel, prefixed with https://)
 * 3. localhost:3000 (local dev fallback)
 * 
 * Note: In Supabase Auth settings:
 * - Site URL should be: https://denku-mvp.vercel.app
 * - Redirect URLs should include:
 *   - https://denku-mvp.vercel.app/auth/callback
 *   - http://localhost:3000/auth/callback (for local dev)
 */
export function getBaseUrl(): string {
  // Explicit production URL (set in Vercel env vars)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  // Vercel auto-detected URL (preview deployments)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // Local dev fallback
  return "http://localhost:3000";
}


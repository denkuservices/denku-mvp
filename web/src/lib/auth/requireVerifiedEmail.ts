import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Require authenticated user with verified email.
 * Redirects to /login if not authenticated.
 * Redirects to /verify-email if email not confirmed.
 * Returns user if verified.
 */
export async function requireVerifiedEmail() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if email is confirmed
  // Supabase user object has email_confirmed_at or confirmed_at depending on version
  const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;

  if (!emailConfirmed) {
    const email = user.email || "";
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  return user;
}


"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Check if current user's email is confirmed.
 * If confirmed, redirects to /dashboard.
 * Returns confirmation status if not confirmed.
 */
export async function checkConfirmedAction(): Promise<{
  confirmed: boolean;
  email?: string;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { confirmed: false };
  }

  const emailConfirmed = (user as any).email_confirmed_at || (user as any).confirmed_at;

  if (emailConfirmed) {
    redirect("/dashboard");
  }

  return {
    confirmed: false,
    email: user.email || undefined,
  };
}


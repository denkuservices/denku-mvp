"use server";

import { cookies } from "next/headers";
import { routing, type Locale } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Persist the signed-in UI preference. This cookie contains no privileged account data. */
export async function setDashboardLocale(value: string): Promise<{ ok: boolean }> {
  if (!routing.locales.includes(value as Locale)) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const [profileResult, authResult] = await Promise.all([
    supabase.from("profiles").update({ ui_locale: value }).eq("auth_user_id", user.id),
    supabase.auth.updateUser({ data: { ui_locale: value } }),
  ]);

  if (profileResult.error || authResult.error) {
    console.error("[locale] Failed to persist language preference", {
      profile: profileResult.error?.message,
      auth: authResult.error?.message,
    });
    return { ok: false };
  }

  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", value, {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}

"use server";

import { cookies } from "next/headers";
import { routing, UI_LOCALE_COOKIE, type Locale } from "@/i18n/routing";
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
  const options = {
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax" as const,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  };

  /*
   * Two cookies, one choice, and the first one is the product's.
   *
   * `NEXT_LOCALE` is next-intl's, and the marketing middleware rewrites it on any
   * locale-resolving navigation — a customer who set the product to Turkish and then clicked the
   * logo had it silently set back to `en`. So the authenticated app reads its own cookie, and
   * `NEXT_LOCALE` is set alongside only so the marketing site and the signed-out auth pages
   * follow the same choice while it lasts.
   */
  cookieStore.set(UI_LOCALE_COOKIE, value, options);
  cookieStore.set("NEXT_LOCALE", value, options);
  return { ok: true };
}

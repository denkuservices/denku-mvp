import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { routing, UI_LOCALE_COOKIE, type Locale } from "./routing";
import { resolveDashboardLocale } from "./dashboardLocale";
import { getCachedUser } from "@/lib/auth/currentUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The authenticated product's language for THIS request.
 *
 * One definition, because there is more than one caller: the layout, which hands it to the locale
 * boundary, and `generateMetadata` on the pages that set a browser-tab title. Two copies of a
 * four-step fallback would drift, and the step that matters — never trusting `NEXT_LOCALE` over
 * the customer's own choice — is exactly the one a second copy would get wrong.
 *
 * Wrapped in React's `cache`, so asking twice in a render costs one resolution. The order itself
 * lives in `resolveDashboardLocale`, where it is pure and pinned by tests; this only gathers the
 * answers, cheapest first, and reaches the database last and only when it must.
 */
export const getDashboardLocale = cache(async (): Promise<Locale> => {
  const jar = await cookies();
  const chosen = jar.get(UI_LOCALE_COOKIE)?.value;

  let account: string | null | undefined;
  let profile: string | null | undefined;

  if (!routing.locales.includes(chosen as Locale)) {
    const user = await getCachedUser();
    account = user?.user_metadata?.ui_locale as string | undefined;

    if (user && !routing.locales.includes(account as Locale)) {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase
        .from("profiles")
        .select("ui_locale")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle<{ ui_locale: string | null }>();
      profile = data?.ui_locale;
    }
  }

  return resolveDashboardLocale({
    chosen,
    account,
    profile,
    hint: jar.get("NEXT_LOCALE")?.value,
  });
});

import "server-only";

import { getDashboardLocale } from "./dashboardLocale.server";
import { getDashboardDictionary } from "./dashboardMessages";
import { translateDashboardCopy } from "./dashboardRuntime";

/**
 * A browser-tab title for an authenticated page, in the reader's language.
 *
 * The locale boundary cannot reach this: it walks `document.body`, and a `<title>` is not in it.
 * Two dashboard pages set one — Appointments and Phone Lines — and both showed an English word
 * in the tab of an otherwise Turkish product. Every other page falls back to "Denku", which needs
 * no translation, which is why this is a helper rather than a convention.
 *
 * Same dictionary as the boundary, so a title and the heading under it can never disagree.
 */
export async function dashboardTitle(english: string): Promise<string> {
  const locale = await getDashboardLocale();
  return translateDashboardCopy(english, getDashboardDictionary(locale), locale);
}

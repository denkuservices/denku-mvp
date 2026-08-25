import { redirect } from "next/navigation";

/**
 * Profile is a section of Account now (Settings 9 → 4), not a route of its own.
 * The URL is kept so shipped links and bookmarks still land on the right thing.
 */
export default function AccountProfileRedirect() {
  redirect("/dashboard/settings/account#profile");
}

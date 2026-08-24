import { redirect } from "next/navigation";

/**
 * Usage is a section of Billing, not a page of its own (Sprint 9 · T5).
 *
 * This route used to render a "Coming soon" card and three em-dash metrics, while the real
 * calls/minutes/concurrency figures were already on the Billing page one item below it in the
 * settings nav. The stub is gone; the URL is kept so shipped links and bookmarks still land
 * somewhere true.
 */
export default function WorkspaceUsagePage() {
  redirect("/dashboard/settings/workspace/billing#usage");
}

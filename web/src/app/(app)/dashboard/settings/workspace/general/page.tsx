import { redirect } from "next/navigation";

/**
 * Identity is a section of Workspace now (Settings 9 → 4), not a route of its own.
 * The URL is kept so shipped links and bookmarks still resolve.
 */
export default function WorkspaceGeneralRedirect() {
  redirect("/dashboard/settings/workspace#identity");
}

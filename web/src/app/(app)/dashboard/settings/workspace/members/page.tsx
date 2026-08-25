import { redirect } from "next/navigation";

/** Members is a section of Workspace now (Settings 9 → 4). The URL still resolves. */
export default function WorkspaceMembersRedirect() {
  redirect("/dashboard/settings/workspace#members");
}

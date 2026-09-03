import { getWorkspaceLaunchpad } from "@/lib/dashboard/workspaceLaunchpad";
import WorkspaceLaunchpadClient from "./WorkspaceLaunchpadClient";

/**
 * First-run guide shown only while an essential is genuinely incomplete. It owns no duplicate
 * progress state: completing a normal settings or channel flow makes the relevant item disappear
 * on the next server render.
 */
export default async function WorkspaceLaunchpad() {
  const model = await getWorkspaceLaunchpad();
  if (!model || model.completedEssentials === model.totalEssentials) return null;
  return <WorkspaceLaunchpadClient model={model} />;
}

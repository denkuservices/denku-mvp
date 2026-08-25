import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * Hiring an AI employee happens on AI Team (Sprint 11 · D7).
 *
 * This route held the only deliberate "create" form, called itself "Create an agent", and nothing
 * in the platform IA linked to it. The form moved to `/dashboard/team/new`; the server action
 * behind it is unchanged. Kept as a redirect so the URL still resolves.
 */
export default function NewAgentRedirect() {
  redirect(platformUxEnabled() ? "/dashboard/team/new" : "/dashboard");
}

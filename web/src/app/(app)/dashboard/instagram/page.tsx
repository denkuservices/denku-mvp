import { redirect } from "next/navigation";

/**
 * Instagram is a channel and now lives with the others (Sprint 11).
 * The old URL is kept and forwarded — the legacy sidebar still links here with the flag off.
 */
export default function InstagramRedirect() {
  redirect("/dashboard/channels/instagram");
}

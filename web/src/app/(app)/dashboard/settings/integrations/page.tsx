import { redirect } from "next/navigation";

/**
 * Integrations is not a destination yet (Sprint 9 · T5).
 *
 * This page rendered two disabled "Coming soon" cards under a heading promising you could
 * "connect external services" — a settings destination that could not be used for anything. It
 * is out of the settings nav until the first real integration ships (R-020 calendar is the
 * likely first). The URL is kept and forwarded so no shipped link dead-ends.
 */
export default function IntegrationsPage() {
  redirect("/dashboard/settings");
}

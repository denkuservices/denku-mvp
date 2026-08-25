import { redirect } from "next/navigation";

/**
 * Phone numbers are a channel, not a product area (Sprint 11).
 *
 * They moved under Channels — `employee_channels` already binds an employee to the channels it
 * answers, and the Channels registry already renders voice as one card among peers; a voice-only
 * top-level nav item re-privileged the one channel the architecture had just de-privileged.
 *
 * The old URLs are kept and forwarded, unconditionally: the legacy sidebar still links here when
 * PLATFORM_UX_ENABLED is off, and the destination renders in both modes.
 */
export default function PhoneLinesRedirect() {
  redirect("/dashboard/channels/phone-numbers");
}

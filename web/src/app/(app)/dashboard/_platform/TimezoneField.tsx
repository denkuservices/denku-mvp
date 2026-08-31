"use client";

import * as React from "react";
import { CONTROL_CLASS } from "./ui";

/**
 * Pick the timezone, starting from the one the browser is already in.
 *
 * This replaced a free-text input that defaulted to "UTC". Almost nobody changed it, so employees
 * were created believing they worked in UTC — and this value is what the AI uses to decide what
 * "tomorrow" and "this afternoon" mean when it books an appointment. A business in İstanbul whose
 * employee thinks it is in UTC books three hours off, and nothing in the product looks broken
 * while it happens.
 *
 * Detection is `Intl.DateTimeFormat().resolvedOptions().timeZone`, NOT an IP lookup. It is the
 * zone the person's own device is set to, so it is both more accurate than geolocation (a VPN or
 * a trip does not move your business) and free of sending anyone's address to a third party.
 *
 * The detected zone is a starting point, never a decision: the full list stays open, and the
 * current local time is shown beside it so the choice can be checked at a glance rather than
 * trusted.
 */

/** Enough of the world to choose from when the browser cannot list zones itself. */
const FALLBACK_ZONES = [
  "UTC",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
];

function detectZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

function listZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch {
    // Older browser — the curated list below is a perfectly usable answer.
  }
  return FALLBACK_ZONES;
}

function localTimeIn(zone: string): string | null {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    }).format(new Date());
  } catch {
    return null;
  }
}

export default function TimezoneField({
  name = "timezone",
  id = "timezone",
  defaultValue,
  value,
  onChange,
  disabled,
  label = "Timezone",
}: {
  name?: string;
  id?: string;
  /** An existing value wins over detection — an employee's saved zone is a decision already made. */
  defaultValue?: string | null;
  /** Controlled mode, for forms that track their own dirty state. */
  value?: string;
  onChange?: (zone: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const controlled = value !== undefined;
  // Server and first client render must agree, so detection happens after mount. Until then the
  // saved value, or UTC, stands.
  const [internalZone, setInternalZone] = React.useState(defaultValue?.trim() || "UTC");
  const zone = controlled ? value : internalZone;
  const setZone = (z: string) => {
    if (!controlled) setInternalZone(z);
    onChange?.(z);
  };
  const [zones, setZones] = React.useState<string[]>(() => {
    const initial = (controlled ? value : defaultValue)?.trim();
    return initial ? [initial] : ["UTC"];
  });
  const [detected, setDetected] = React.useState<string | null>(null);

  React.useEffect(() => {
    const all = listZones();
    const found = detectZone();
    setDetected(found);

    // A value the parent already holds is a decision; detection may only fill an empty one.
    const existing = (controlled ? value : defaultValue)?.trim();
    const initial = existing || found || "UTC";
    // Keep the chosen value selectable even if the browser's list somehow omits it.
    setZones(all.includes(initial) ? all : [initial, ...all]);
    if (!existing) setZone(initial);
    else if (!internalZone) setInternalZone(initial);
    // Runs once: re-detecting after the customer has chosen would overwrite their choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = localTimeIn(zone);

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={zone}
        onChange={(e) => setZone(e.target.value)}
        disabled={disabled}
        className={`${CONTROL_CLASS} w-full`}
      >
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500">
        Used whenever it says &ldquo;today&rdquo;, &ldquo;tomorrow&rdquo; or books a time.
        {now ? ` It is ${now} there now.` : ""}
        {detected && detected === zone ? " Detected from your browser." : ""}
      </p>
    </div>
  );
}

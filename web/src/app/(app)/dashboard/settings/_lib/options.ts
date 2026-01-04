/**
 * Language and timezone options for workspace settings
 */

export type LanguageOption = {
  value: string;
  label: string;
};

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
  { value: "tr", label: "Turkish" },
  { value: "es", label: "Spanish" },
];

/**
 * Get IANA timezone options.
 * Uses Intl.supportedValuesOf when available (Node 20+),
 * otherwise falls back to a curated list.
 */
export function getTimeZoneOptions(): string[] {
  // Check if Intl.supportedValuesOf is available (Node 20+)
  if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      // Fallback if not supported
    }
  }

  // Fallback curated list
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Istanbul",
  ];
}

/**
 * Check if a language value is valid
 */
export function isValidLanguage(value: string | null | undefined): boolean {
  if (!value) return false;
  return LANGUAGE_OPTIONS.some((opt) => opt.value === value);
}

/**
 * Check if a timezone value is valid
 */
export function isValidTimezone(value: string | null | undefined): boolean {
  if (!value) return false;
  const validZones = getTimeZoneOptions();
  return validZones.includes(value) || value === "UTC";
}


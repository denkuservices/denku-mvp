/**
 * Language and timezone options for workspace settings
 */

export type LanguageOption = {
  value: string;
  label: string;
};

/**
 * The workspace default language — the languages the voice stack can actually speak.
 *
 * Turkish was removed here for the same reason it was removed from the employee Setup editor
 * (R-135): voice and transcriber defaults exist only for English and Spanish, so `resolveLanguage`
 * sends anything else to English. A workspace set to Turkish silently became the default for every
 * new employee, each of which then answered callers in English while three separate screens said
 * Turkish.
 *
 * This list and `SETUP_LANGUAGES` are two pickers over one capability; `vapi-assistant-config.test.ts`
 * asserts both resolve to distinct supported languages, so adding one here without teaching the
 * resolver fails in CI rather than on a customer's call.
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "en", label: "English" },
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


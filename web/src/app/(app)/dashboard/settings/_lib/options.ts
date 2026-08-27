/**
 * Language and timezone options for workspace settings
 */

import { LANGUAGES, LANGUAGE_CODES } from "@/lib/language/registry";

export type LanguageOption = {
  value: string;
  label: string;
};

/**
 * The workspace default language — derived from the language registry (2026-08-28).
 *
 * This list used to be maintained by hand alongside `SETUP_LANGUAGES` and the voice/transcriber
 * tables: three descriptions of one capability, which is how Turkish once sat in two pickers with
 * no voice behind it (R-135). Both pickers now read the registry, so a language that cannot be
 * heard and spoken cannot appear here at all.
 */
export const LANGUAGE_OPTIONS: LanguageOption[] = LANGUAGE_CODES.map((code) => ({
  value: code,
  label: LANGUAGES[code].label,
}));

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


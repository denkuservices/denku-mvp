/**
 * The colours a business can make its own — and the gate that keeps them colours.
 *
 * Pure and dependency-free so both halves can use it: the server validates on write, and the
 * widget validates again before touching the DOM. Two checks of the same rule is not belt and
 * braces here, it is the two ends of an untrusted path — a value written months ago by one
 * person's dashboard is rendered later into a page served to a stranger's browser.
 *
 * **Strict hex only, and that is the whole point.** These strings end up as CSS custom property
 * values. Anything richer — a `url()`, a `var()`, a semicolon — is a value the widget has no use
 * for and an author of it might. The set of things a shop owner actually wants to say here is
 * "this colour", and `#RRGGBB` says it completely. So a bad value is not sanitised into a good
 * one; it is dropped, and the widget's own default shows through, which is the visible,
 * correctable failure rather than the silent one.
 */

export interface WebChatTheme {
  /** Launcher bubble, the visitor's own messages, and the send button. */
  accent?: string;
  /** The conversation's background — the "paper" the bubbles sit on. */
  surface?: string;
  /** The bar across the top of the panel. */
  headerBg?: string;
  /** Text and the close button inside that bar. */
  headerText?: string;
}

export const THEME_KEYS = ["accent", "surface", "headerBg", "headerText"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

/** What the widget looks like when a business has said nothing. Matches `app.css`. */
export const DEFAULT_THEME: Required<WebChatTheme> = {
  accent: "#1B6E6E",
  surface: "#F7F5F1",
  headerBg: "#1B6E6E",
  headerText: "#FFFFFF",
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** A colour, or null. Never a repaired approximation of one. */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

/**
 * Keep only the keys we know and the values that are colours.
 *
 * An unknown key is dropped rather than stored: the column is jsonb, so without this it would
 * happily accept anything a modified request sent, and the next person to read the theme would
 * find fields nobody designed.
 */
export function sanitizeTheme(input: unknown): WebChatTheme {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: WebChatTheme = {};
  for (const key of THEME_KEYS) {
    const color = normalizeColor(raw[key]);
    if (color) out[key] = color;
  }
  return out;
}

/**
 * The theme the widget should actually render, defaults filled in.
 *
 * `accentColor` is the column that existed before this file did; it stays the fallback for
 * `accent` so an install themed before the colour picker shipped keeps the colour it was given.
 */
export function resolveTheme(theme: unknown, accentColor?: string | null): Required<WebChatTheme> {
  const clean = sanitizeTheme(theme);
  const legacyAccent = normalizeColor(accentColor);
  return {
    accent: clean.accent ?? legacyAccent ?? DEFAULT_THEME.accent,
    surface: clean.surface ?? DEFAULT_THEME.surface,
    // A business that picks one brand colour means the header too — asking them to set the same
    // hex twice is a question with one sensible answer.
    headerBg: clean.headerBg ?? clean.accent ?? legacyAccent ?? DEFAULT_THEME.headerBg,
    headerText: clean.headerText ?? DEFAULT_THEME.headerText,
  };
}

"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * The one save button for the AI Team surfaces.
 *
 * **Why it exists:** every editor here confirmed a save in a banner at the TOP of the page, while
 * the reader's eye — and cursor — was at the BOTTOM, on the button they had just pressed. What
 * that button did next was go grey and disabled, because a successful save clears the dirty flag.
 * Grey and disabled is exactly what a frozen control looks like, so people sat waiting for
 * something that had already happened. The confirmation has to appear where the click did.
 *
 * Three states, in this order of precedence:
 *   1. **saving** — the write is in flight (a spinner, so it never reads as a dead control);
 *   2. **saved** — it landed: green, with a tick, for a couple of seconds;
 *   3. **idle** — enabled while there is something to save, disabled when there is not.
 *
 * `saved` is suppressed the moment the form is dirty again: a tick sitting over unsaved edits
 * would be a lie, and the next keystroke is the clearest possible signal the reader has moved on.
 */
export const SAVED_FLASH_MS = 2500;

/**
 * Hold "Saved" for a beat, then let the button go back to normal.
 *
 * A hook rather than something each form re-implements, because the timer needs clearing on
 * unmount — the tabs here are query-param navigations, so an editor can unmount mid-flash.
 */
export function useSavedFlash(durationMs: number = SAVED_FLASH_MS) {
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), durationMs);
    return () => clearTimeout(t);
  }, [saved, durationMs]);

  const flashSaved = React.useCallback(() => setSaved(true), []);
  const clearSaved = React.useCallback(() => setSaved(false), []);

  return { saved, flashSaved, clearSaved };
}

export type SaveButtonVariant = "primary" | "secondary";
export type SaveButtonSize = "md" | "sm";

export default function SaveButton({
  onClick,
  saving = false,
  saved = false,
  /** True while there are unsaved edits. Drives both the disabled state and the tick's honesty. */
  dirty = true,
  disabled = false,
  label = "Save changes",
  savingLabel = "Saving…",
  savedLabel = "Saved",
  title,
  variant = "primary",
  size = "md",
  className = "",
}: {
  onClick: () => void;
  saving?: boolean;
  saved?: boolean;
  dirty?: boolean;
  disabled?: boolean;
  label?: string;
  savingLabel?: string;
  savedLabel?: string;
  title?: string;
  variant?: SaveButtonVariant;
  size?: SaveButtonSize;
  className?: string;
}) {
  // A tick must never sit over edits that are not saved — the newer keystroke wins.
  const showSaved = saved && !dirty && !saving;

  const sizing =
    size === "sm"
      ? "h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
      : "h-10 gap-2 rounded-lg px-4 text-sm font-semibold";

  const tone = showSaved
    ? // Green survives being disabled: the confirmation is the whole point, so it must not fade
      // out along with the button's idle styling.
      "bg-green-600 text-white disabled:opacity-100"
    : variant === "primary"
      ? "bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
      : "border border-gray-200 bg-white text-navy-700 hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving || !dirty}
      title={title}
      // Screen readers get the same news the tick gives everyone else.
      aria-live="polite"
      className={`inline-flex items-center transition disabled:cursor-not-allowed ${sizing} ${tone} ${className}`}
    >
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {savingLabel}
        </>
      ) : showSaved ? (
        <>
          <Check className="h-4 w-4" aria-hidden="true" />
          {savedLabel}
        </>
      ) : (
        label
      )}
    </button>
  );
}

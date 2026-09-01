"use client";

import React from "react";

/**
 * One colour, picked or typed.
 *
 * Both affordances, because they serve two different people: a shop owner opens the swatch and
 * drags, and whoever was handed a brand guide types `#1B6E6E`. Offering only the native picker
 * makes an exact brand colour needlessly hard to enter; offering only the text field makes
 * choosing one needlessly hard for everyone else.
 *
 * The typed field reports every keystroke, but only once it is a complete colour — otherwise the
 * preview would repaint through `#1`, `#1B`, `#1B6` on the way to `#1B6E6E`, flashing three
 * colours nobody chose. The swatch is always in sync because it can only ever hold a valid value.
 */
export default function ColorField({
  id,
  name,
  label,
  hint,
  value,
  fallback,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  /** The chosen colour, or empty when the business has not chosen one. */
  value: string;
  /** What the widget uses when nothing is chosen — shown in the swatch so it is never blank. */
  fallback: string;
  onChange: (next: string) => void;
}) {
  const [text, setText] = React.useState(value);

  // The form can be reset or saved from elsewhere; follow the source of truth when it moves.
  React.useEffect(() => setText(value), [value]);

  const complete = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text.trim());

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 dark:text-gray-300">
        {label}
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} — colour picker`}
          value={complete ? text : fallback}
          onChange={(e) => {
            setText(e.target.value.toUpperCase());
            onChange(e.target.value.toUpperCase());
          }}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-navy-800"
        />
        <input
          id={id}
          name={name}
          value={text}
          placeholder={fallback}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            // Half a hex code is not a colour yet. Waiting avoids repainting through it.
            if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next.trim()) || next.trim() === "") {
              onChange(next.trim().toUpperCase());
            }
          }}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm uppercase text-navy-700 dark:border-white/10 dark:bg-navy-800 dark:text-white"
        />
      </div>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

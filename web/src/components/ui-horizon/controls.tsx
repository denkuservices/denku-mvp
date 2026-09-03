import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one form-control recipe for every authenticated surface.
 *
 * **Why this file is the only place these strings may live.** There were two `CONTROL_CLASS`
 * constants — this one and another in `app/(app)/dashboard/_platform/ui` — with the same name and
 * different looks: `rounded-xl`/`shadow-sm`/`ring-4`/`navy-900`/`px-3.5` here against
 * `rounded-lg`/no shadow/`ring-2`/`navy-800`/`px-3` there. Three migrated pages wore one, forty-odd
 * surfaces wore the other, and nothing in the type system could notice. A dashboard cannot be
 * "consistent" while the constant that defines consistency exists twice.
 *
 * The values kept are the ones the dashboard already wears, so unifying changed forty-odd screens
 * by nothing and three screens back into line with them. `_platform/ui` re-exports `CONTROL_CLASS`
 * from here rather than declaring its own, which keeps its forty importers untouched.
 *
 * **Padding is composed, never overridden.** `CONTROL_BASE` carries no horizontal padding on
 * purpose. `CONTROL_CLASS` used to carry `px-3` and `SearchField` tried to beat it with `pl-9` to
 * clear the magnifier — but in Tailwind v4 those are different properties (`px-*` is the
 * `padding-inline` shorthand, `pl-*` is `padding-inline-start`), so which wins depends on their
 * order in the generated stylesheet, not on the order in the class attribute. When the shorthand
 * won, the placeholder rendered underneath the icon. Compose; do not override.
 */
const CONTROL_BASE =
  "h-10 rounded-lg border border-gray-200 bg-white text-sm text-navy-700 outline-none transition " +
  "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 " +
  "dark:border-white/10 dark:bg-navy-800 dark:text-white";

/** Chrome for a plain `<input>` / `<select>`. */
export const CONTROL_CLASS = `${CONTROL_BASE} px-3`;

/**
 * Chrome for a search input with the magnifier overlaid.
 *
 * `pl-10` clears the icon at `left-3`; `pr-9` keeps the browser's native clear affordance off the
 * value. The two are paired here so neither can be edited without the other.
 */
export const SEARCH_CONTROL_CLASS = `${CONTROL_BASE} pl-10 pr-9`;

/**
 * The filled variant — same height and focus behaviour, no border.
 *
 * For the Inbox, where the field is the first thing inside an already-bounded pane and an outline
 * would draw a box inside a box. It carries the Inbox's own palette deliberately (see
 * `docs/INBOX_V2.md`): that surface is a messaging surface and does not use `brand-500`.
 */
export const FILLED_CONTROL_BASE =
  "h-10 rounded-full border border-transparent bg-[#F1F0ED] text-sm text-navy-700 outline-none transition " +
  "placeholder:text-gray-500 focus:border-[#25D366]/40 focus:ring-2 focus:ring-[#25D366]/15 " +
  "dark:bg-[#202C33] dark:text-white dark:placeholder:text-[#8696A0]";

/** Chrome without horizontal padding, for callers that compose their own. */
export const CONTROL_BASE_CLASS = CONTROL_BASE;

export function FieldLabel({
  htmlFor,
  children,
  className,
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("text-xs font-semibold text-navy-700 dark:text-white", className)}
    >
      {children}
    </label>
  );
}

export function SearchControl({
  className,
  inputClassName,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { inputClassName?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />
      <input type="search" className={cn(SEARCH_CONTROL_CLASS, inputClassName)} {...props} />
    </div>
  );
}

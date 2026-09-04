import { inbox } from "./_components/theme";
import SlowLoadNotice from "../_platform/ui/SlowLoadNotice";

/**
 * The conversation pane while it loads.
 *
 * Shaped like a thread rather than like a list: this boundary sits in the split view's right
 * half (the list is in the layout and never unmounts), so a row skeleton here would promise the
 * wrong thing for the half-second it is up.
 */
export default function Loading() {
  const widths = ["w-1/2", "w-2/3", "w-1/3", "w-3/5", "w-2/5"];

  return (
    <>
      <div className={`flex h-full flex-col ${inbox.thread}`} aria-hidden="true">
        <div className={`h-[61px] shrink-0 border-b ${inbox.frame} ${inbox.panel}`} />
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-6 md:px-8">
          {widths.map((w, i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
              <div
                className={`h-10 animate-pulse rounded-lg ${w} ${
                  i % 2 ? "bg-[#E6F5EC] dark:bg-[#005C4B]/60" : "bg-white dark:bg-[#202C33]"
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Outside the skeleton, which is `aria-hidden` — a live region inside it is never read. */}
      <SlowLoadNotice />
    </>
  );
}

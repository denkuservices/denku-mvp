"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import type { LanguageCode } from "@/lib/language/registry";
import {
  HUMANNESS_LABELS,
  HUMANNESS_LEGEND,
  isDefaultVoice,
  voiceLanguageLabels,
  voicesForLanguage,
  type VoiceOption,
} from "@/lib/voice/catalogue";

/**
 * The voice picker — a listbox, not a stack of radio cards (2026-09-02).
 *
 * **Why the change.** Setup rendered every voice as an always-open card, so the one fact a reader
 * needs first — *which voice is my business using right now?* — was the hardest thing on the page
 * to find, and the list could not grow without pushing the rest of the form off the screen. A
 * closed control states the answer in one line and opens to the comparison, which is the same shape
 * Vapi's own picker uses and the same shape as every other control in this form.
 *
 * **What each row now says**, because "Sarah / Matilda / Joseph" is not a decision anyone can make:
 * the languages the voice actually speaks, one line of character, and a humanness rating that is
 * explicitly OURS (see `HUMANNESS_LEGEND` — Vapi publishes no such score, so claiming one would be
 * the fabrication this codebase bans). The rating is rendered as pips AND named in text, so it is
 * not a row of dots someone has to decode.
 *
 * **No audio preview, by decision.** One was built and cut the same day (2026-09-02): the vendor
 * clips are generic English, and rendering an honest per-language greeting would mean carrying two
 * provider keys for a feature nobody asked for. So every row must earn its place in words — which
 * is why the description, the rating and the "heard on a real call" badge are the three things a
 * row shows, and why none of them may overstate. Picking a voice and listening to the next real
 * call is the loop now; it costs a save, not a deploy.
 *
 * Native `<select>` was considered and cannot do this: an `<option>` may contain text and nothing
 * else, so there is no room for a play button, a badge, or two lines of description.
 */
export default function VoicePicker({
  language,
  languageLabel,
  value,
  onChange,
  disabled = false,
}: {
  language: LanguageCode;
  /** The language's display name, for copy that has to name it ("Voices that speak Turkish"). */
  languageLabel: string;
  /** Catalogue id, or null / an unrecognised value meaning "the language's default". */
  value: string | null;
  onChange: (voiceId: string) => void;
  disabled?: boolean;
}) {
  const options = React.useMemo(() => voicesForLanguage(language), [language]);

  /**
   * What is actually selected.
   *
   * The fallback is the FIRST option, which `voicesForLanguage` guarantees is the language's own
   * default — so an employee with no stored voice, or one holding a legacy value like `alloy`, is
   * shown the voice its callers are really hearing. Showing the first ElevenLabs voice instead is
   * exactly the bug this list was rebuilt to close.
   */
  const selected = options.find((v) => v.id === value) ?? options[0] ?? null;

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Close on an outside click or Escape, and stop any audio with it: a sample still playing from a
  // list the reader has dismissed is a sound with no visible source.
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /**
   * Move focus into the list once React has actually rendered it.
   *
   * An effect rather than a `requestAnimationFrame` inside the click handler: at click time the
   * list does not exist yet, so the ref is still null and the arrow keys silently do nothing —
   * which is precisely how it behaved when first tried.
   */
  React.useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  const openList = () => {
    if (disabled) return;
    setActiveIndex(Math.max(0, options.findIndex((v) => v.id === selected?.id)));
    setOpen(true);
  };

  const choose = (voice: VoiceOption) => {
    onChange(voice.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const voice = options[activeIndex];
      if (voice) choose(voice);
    }
  };

  if (!selected) {
    // No voice speaks this language. The registry forbids that combination reaching a picker at
    // all, so say it plainly rather than rendering an empty control.
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
        No voice is configured for {languageLabel}.
      </p>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          disabled
            ? "cursor-not-allowed border-gray-200 opacity-60 dark:border-white/10"
            : "border-gray-200 hover:border-gray-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-white/10 dark:hover:border-white/20"
        } bg-white dark:bg-navy-800`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-navy-700 dark:text-white">{selected.label}</span>
            <span className="text-xs text-gray-400">{traits(selected)}</span>
            {isDefaultVoice(language, selected) ? <DefaultBadge /> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
            {selected.description}
          </span>
        </span>
        <Humanness score={selected.humanness} compact />
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={`Voices that speak ${languageLabel}`}
          aria-activedescendant={options[activeIndex] ? `voice-opt-${options[activeIndex].id}` : undefined}
          onKeyDown={onListKeyDown}
          className="absolute z-30 mt-1.5 max-h-[26rem] w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl outline-none dark:border-white/10 dark:bg-navy-800"
        >
          {options.map((voice, i) => {
            const isSelected = voice.id === selected.id;
            return (
              <div
                key={voice.id}
                id={`voice-opt-${voice.id}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(voice)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer rounded-lg p-3 transition ${
                  isSelected
                    ? "bg-brand-50/70 dark:bg-brand-400/10"
                    : i === activeIndex
                    ? "bg-gray-50 dark:bg-white/5"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-4 shrink-0">
                    {isSelected ? <Check className="h-4 w-4 text-brand-500" aria-hidden /> : null}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-navy-700 dark:text-white">
                        {voice.label}
                      </span>
                      <span className="text-xs text-gray-400">{traits(voice)}</span>
                      {isDefaultVoice(language, voice) ? <DefaultBadge /> : null}
                      {voice.provenCall ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                          Heard on a real call
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{voice.description}</p>

                    {/* The languages it speaks. A voice offered under Turkish that also speaks
                        Spanish matters the day the business adds a second language. */}
                    <p className="mt-1 text-[11px] text-gray-400">
                      Speaks {voiceLanguageLabels(voice).join(", ")}
                    </p>

                    <div className="mt-2">
                      <Humanness score={voice.humanness} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** "female · American", or just the timbre when the provider never said where it is from. */
function traits(voice: VoiceOption): string {
  return voice.accent ? `${voice.timbre} · ${voice.accent}` : voice.timbre;
}

function DefaultBadge() {
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-white/10 dark:text-gray-300">
      Default
    </span>
  );
}

/**
 * The rating, as pips and as a word.
 *
 * Both, always. Five dots alone are a scale with no units — the reader has to guess whether four is
 * good — and the word alone loses the comparison between two rows. `title` carries the legend so
 * the claim's owner (us, not the vendor) is one hover away wherever this appears.
 */
function Humanness({ score, compact = false }: { score: VoiceOption["humanness"]; compact?: boolean }) {
  const label = HUMANNESS_LABELS[score];
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 ${compact ? "" : "text-[11px] text-gray-500 dark:text-gray-400"}`}
      title={`Humanness ${score}/5 — ${label}. ${HUMANNESS_LEGEND}`}
      aria-label={`Humanness ${score} out of 5, ${label}`}
    >
      <span className="flex items-center gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((pip) => (
          <span
            key={pip}
            className={`h-1.5 w-1.5 rounded-full ${
              pip <= score ? "bg-brand-500" : "bg-gray-200 dark:bg-white/15"
            }`}
          />
        ))}
      </span>
      {compact ? null : <span>{label}</span>}
    </span>
  );
}

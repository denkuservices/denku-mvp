"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/toast/ToastProvider";
import {
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import {
  AFTER_HOURS_BEHAVIOURS,
  AFTER_HOURS_HINT,
  AFTER_HOURS_LABEL,
  DAY_NAMES,
  defaultBusinessHours,
  describeBusinessHours,
  type AfterHoursBehaviour,
  type BusinessHours,
  type HoursException,
} from "@/lib/business-hours/schema";
import { saveBusinessHours } from "../../../_actions/businessHours";

/**
 * Opening hours, as an editor rather than a sentence.
 *
 * **These hours never switch the AI off.** Denku answers 24/7 on every channel and that is the
 * product; what the hours change is what the AI is honest about — whether a person is around, and
 * when one will be. The editor's copy has to carry that, because "opening hours" in a settings
 * page reads like a shutter by default, and a customer who believed it would think they were
 * turning their phone line off at six.
 *
 * Before this existed, "opening hours" was free text inside the AI prompt, so the AI could say a
 * closing time it had no way to reason about at all.
 *
 * Three decisions worth keeping:
 *
 *   * **The week starts on Monday** even though the data is indexed Sunday-first (to match
 *     `Date.getDay()`). Nobody writes their opening hours starting with Sunday.
 *   * **"Copy to weekdays"** exists because the overwhelmingly common case is five identical days,
 *     and making someone set the same two times five times is how a settings page earns its
 *     reputation.
 *   * **Exceptions are dated, not recurring.** A public holiday moves; "closed on the 25th" is a
 *     fact about one day, and a recurrence rule would be a promise to get Easter right.
 */

type Props = {
  initialHours: BusinessHours | null;
  initialBehaviour: AfterHoursBehaviour;
  timeZoneLabel: string | null;
  canEdit: boolean;
};

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function BusinessHoursCard({
  initialHours,
  initialBehaviour,
  timeZoneLabel,
  canEdit,
}: Props) {
  const { success, error: toastError } = useToast();
  const [enabled, setEnabled] = useState(Boolean(initialHours));
  const [hours, setHours] = useState<BusinessHours>(initialHours ?? defaultBusinessHours());
  const [behaviour, setBehaviour] = useState<AfterHoursBehaviour>(initialBehaviour);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => (enabled ? describeBusinessHours(hours) : null), [enabled, hours]);

  const patchDay = (day: number, patch: Partial<BusinessHours["days"][number]>) =>
    setHours((h) => ({
      ...h,
      days: h.days.map((d) => (d.day === day ? { ...d, ...patch } : d)),
    }));

  const setInterval_ = (day: number, index: number, field: "open" | "close", value: string) =>
    setHours((h) => ({
      ...h,
      days: h.days.map((d) =>
        d.day === day
          ? { ...d, intervals: d.intervals.map((i, n) => (n === index ? { ...i, [field]: value } : i)) }
          : d
      ),
    }));

  const addInterval = (day: number) =>
    setHours((h) => ({
      ...h,
      days: h.days.map((d) =>
        d.day === day && d.intervals.length < 4
          ? { ...d, closed: false, intervals: [...d.intervals, { open: "09:00", close: "17:00" }] }
          : d
      ),
    }));

  const removeInterval = (day: number, index: number) =>
    setHours((h) => ({
      ...h,
      days: h.days.map((d) =>
        d.day === day ? { ...d, intervals: d.intervals.filter((_, n) => n !== index) } : d
      ),
    }));

  /** Take this day's hours and give them to Mon–Fri. The five-identical-days shortcut. */
  const copyToWeekdays = (day: number) => {
    const source = hours.days.find((d) => d.day === day);
    if (!source) return;
    setHours((h) => ({
      ...h,
      days: h.days.map((d) =>
        d.day >= 1 && d.day <= 5
          ? { ...d, closed: source.closed, intervals: source.intervals.map((i) => ({ ...i })) }
          : d
      ),
    }));
  };

  const addException = () => {
    const today = new Date().toISOString().slice(0, 10);
    setHours((h) => ({
      ...h,
      exceptions: [...h.exceptions, { date: today, closed: true, intervals: [], label: "" }],
    }));
  };

  const patchException = (index: number, patch: Partial<HoursException>) =>
    setHours((h) => ({
      ...h,
      exceptions: h.exceptions.map((e, n) => (n === index ? { ...e, ...patch } : e)),
    }));

  const removeException = (index: number) =>
    setHours((h) => ({ ...h, exceptions: h.exceptions.filter((_, n) => n !== index) }));

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Strip labels that are only whitespace so an empty box does not become an empty reason.
      const payload = enabled
        ? {
            ...hours,
            exceptions: hours.exceptions.map((e) => ({
              ...e,
              label: e.label?.trim() ? e.label.trim() : undefined,
            })),
          }
        : null;

      const result = await saveBusinessHours({ hours: payload, behaviour });
      if (result.ok) {
        setSaved(true);
        success(result.summary);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
        toastError(result.error);
      }
    });
  };

  const time =
    "h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm text-navy-700 outline-none transition focus:border-brand-500 disabled:opacity-50 dark:border-white/10 dark:bg-navy-900 dark:text-white";

  return (
    <Panel>
      <PanelHeader
        icon={Clock}
        title="Opening hours"
        description={
          enabled
            ? "When your team is in. Your AI answers 24/7 either way — these hours are what it tells customers about reaching a person."
            : "Not set. Your AI answers around the clock and won't mention opening hours to anyone."
        }
        action={
          timeZoneLabel ? (
            <StatusPill tone="neutral" icon={Clock}>
              {timeZoneLabel}
            </StatusPill>
          ) : null
        }
      />

      <div className="mt-5 space-y-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit || isPending}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          <span className="text-sm text-navy-700 dark:text-white">
            Set opening hours
            <span className="block text-xs text-gray-500">
              Leave this off and your AI simply never mentions them. It answers every call and
              message either way — that never changes.
            </span>
          </span>
        </label>

        {enabled ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Opening hours for each day of the week</caption>
                <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                  {ORDER.map((day) => {
                    const d = hours.days.find((x) => x.day === day);
                    if (!d) return null;
                    return (
                      <tr key={day}>
                        <th
                          scope="row"
                          className="w-28 py-3 pr-3 text-left align-top text-sm font-medium text-navy-700 dark:text-white"
                        >
                          {DAY_NAMES[day]}
                        </th>
                        <td className="py-3 pr-3 align-top">
                          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={!d.closed}
                              disabled={!canEdit || isPending}
                              onChange={(e) =>
                                patchDay(day, {
                                  closed: !e.target.checked,
                                  intervals:
                                    e.target.checked && d.intervals.length === 0
                                      ? [{ open: "09:00", close: "17:00" }]
                                      : d.intervals,
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                            />
                            Open
                          </label>
                        </td>
                        <td className="py-3 align-top">
                          {d.closed ? (
                            <span className="text-xs text-gray-400">Closed</span>
                          ) : (
                            <div className="space-y-2">
                              {d.intervals.map((interval, index) => (
                                <div key={index} className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="time"
                                    aria-label={`${DAY_NAMES[day]} opening time ${index + 1}`}
                                    value={interval.open}
                                    disabled={!canEdit || isPending}
                                    onChange={(e) => setInterval_(day, index, "open", e.target.value)}
                                    className={time}
                                  />
                                  <span aria-hidden="true" className="text-gray-400">
                                    –
                                  </span>
                                  <input
                                    type="time"
                                    aria-label={`${DAY_NAMES[day]} closing time ${index + 1}`}
                                    value={interval.close}
                                    disabled={!canEdit || isPending}
                                    onChange={(e) => setInterval_(day, index, "close", e.target.value)}
                                    className={time}
                                  />
                                  {d.intervals.length > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() => removeInterval(day, index)}
                                      disabled={!canEdit || isPending}
                                      aria-label={`Remove this ${DAY_NAMES[day]} time range`}
                                      className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              ))}

                              <div className="flex flex-wrap gap-3">
                                {d.intervals.length < 4 ? (
                                  <button
                                    type="button"
                                    onClick={() => addInterval(day)}
                                    disabled={!canEdit || isPending}
                                    className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                                  >
                                    + Add a break
                                  </button>
                                ) : null}
                                {day >= 1 && day <= 5 ? (
                                  <button
                                    type="button"
                                    onClick={() => copyToWeekdays(day)}
                                    disabled={!canEdit || isPending}
                                    className="text-xs font-medium text-gray-500 hover:underline"
                                  >
                                    Copy to Mon–Fri
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-gray-500">
              A closing time earlier than the opening time means the day runs past midnight — set
              22:00–02:00 for a bar that closes at two.
            </p>

            {/* ------------------------------------------------------- exceptions */}
            <div className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-navy-700 dark:text-white">
                  <CalendarOff aria-hidden="true" className="h-4 w-4 text-gray-400" />
                  Holidays and one-off changes
                </p>
                <button
                  type="button"
                  onClick={addException}
                  disabled={!canEdit || isPending || hours.exceptions.length >= 60}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add a date
                </button>
              </div>

              {hours.exceptions.length === 0 ? (
                <p className="text-xs text-gray-500">
                  Nothing yet. A date added here overrides the week above — that is how a public
                  holiday beats &ldquo;open on Thursdays&rdquo;.
                </p>
              ) : (
                <ul className="space-y-2">
                  {hours.exceptions.map((ex, index) => (
                    <li key={index} className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        aria-label="Date"
                        value={ex.date}
                        disabled={!canEdit || isPending}
                        onChange={(e) => patchException(index, { date: e.target.value })}
                        className={time}
                      />
                      <input
                        type="text"
                        aria-label="What this date is"
                        placeholder="Christmas Day"
                        maxLength={80}
                        value={ex.label ?? ""}
                        disabled={!canEdit || isPending}
                        onChange={(e) => patchException(index, { label: e.target.value })}
                        className={`${time} min-w-[140px] flex-1`}
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={ex.closed}
                          disabled={!canEdit || isPending}
                          onChange={(e) =>
                            patchException(index, {
                              closed: e.target.checked,
                              intervals: e.target.checked ? [] : [{ open: "10:00", close: "16:00" }],
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                        />
                        Closed
                      </label>

                      {!ex.closed ? (
                        <>
                          <input
                            type="time"
                            aria-label="Opening time on this date"
                            value={ex.intervals[0]?.open ?? "10:00"}
                            disabled={!canEdit || isPending}
                            onChange={(e) =>
                              patchException(index, {
                                intervals: [
                                  { open: e.target.value, close: ex.intervals[0]?.close ?? "16:00" },
                                ],
                              })
                            }
                            className={time}
                          />
                          <span aria-hidden="true" className="text-gray-400">
                            –
                          </span>
                          <input
                            type="time"
                            aria-label="Closing time on this date"
                            value={ex.intervals[0]?.close ?? "16:00"}
                            disabled={!canEdit || isPending}
                            onChange={(e) =>
                              patchException(index, {
                                intervals: [
                                  { open: ex.intervals[0]?.open ?? "10:00", close: e.target.value },
                                ],
                              })
                            }
                            className={time}
                          />
                        </>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => removeException(index)}
                        disabled={!canEdit || isPending}
                        aria-label="Remove this date"
                        className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* --------------------------------------------------- after hours */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-navy-700 dark:text-white">
                When someone gets in touch outside these hours
              </legend>
              <p className="text-xs text-gray-500">
                Your AI answers and helps in both cases. The only difference is whether it says
                out loud that your team is away.
              </p>
              {AFTER_HOURS_BEHAVIOURS.map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                    behaviour === value
                      ? "border-brand-500 bg-brand-500/5"
                      : "border-gray-200 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                  }`}
                >
                  <input
                    type="radio"
                    name="after-hours"
                    value={value}
                    checked={behaviour === value}
                    disabled={!canEdit || isPending}
                    onChange={() => setBehaviour(value)}
                    className="mt-0.5 h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-navy-700 dark:text-white">
                      {AFTER_HOURS_LABEL[value]}
                    </span>
                    <span className="block text-xs text-gray-500">{AFTER_HOURS_HINT[value]}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {summary ? (
              <p className="text-xs text-gray-500">
                The AI will describe your hours as: <span className="font-medium">{summary}</span>
              </p>
            ) : null}
          </>
        ) : null}

        {/*
          The thing a customer is most likely to get wrong about this screen, said where they will
          read it rather than buried in a hint. "Opening hours" in a settings page looks like an
          off switch; here it is not one, on any channel.
        */}
        {enabled ? (
          <Notice tone="info" icon={Info}>
            Your AI keeps answering calls and messages 24/7 — on every channel, at every hour.
            These hours only change what it tells people about when your team is available.
          </Notice>
        ) : null}

        {error ? (
          <Notice tone="critical" icon={AlertCircle}>
            {error}
          </Notice>
        ) : null}

        {saved ? (
          <Notice tone="ok" icon={CheckCircle2}>
            Opening hours saved.
          </Notice>
        ) : null}

        {canEdit ? (
          <div className="flex justify-end">
            <SettingsButton type="button" variant="primary" onClick={save} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save opening hours"}
            </SettingsButton>
          </div>
        ) : (
          <p className="text-xs text-gray-500">Only owners and admins can change opening hours.</p>
        )}
      </div>
    </Panel>
  );
}

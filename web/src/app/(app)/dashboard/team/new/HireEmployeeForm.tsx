"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertTriangle, Loader2, Phone, MessageSquare } from "lucide-react";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/language/registry";
import { CONTROL_CLASS } from "../../_platform/ui";
import TimezoneField from "../../_platform/TimezoneField";
import { createAgentAction, type CreateAgentResult } from "../../agents/new/actions";

/**
 * The hire form, as a client component so a refusal can be shown next to the button.
 *
 * It used to be a plain server-action form. Every refusal the action could make — a paused
 * workspace, no phone capacity — was thrown, and a thrown error in a server action reaches the
 * route's error boundary: "Something went wrong. We couldn't load this page." That sentence is
 * true of a crash and useless for a rule the customer could have satisfied.
 *
 * `willGetPhone` is decided on the server and stated BEFORE the button is pressed, because "this
 * employee will not have a phone number" is something to know while deciding, not to discover
 * afterwards.
 */
export default function HireEmployeeForm({
  defaultLanguage,
  willGetPhone,
  phoneReason,
}: {
  defaultLanguage: string;
  willGetPhone: boolean;
  /** Why there is no line, in the customer's terms. Null when they are getting one. */
  phoneReason: string | null;
}) {
  const [state, formAction, pending] = useActionState<CreateAgentResult | null, FormData>(
    createAgentAction,
    null
  );

  return (
    <form action={formAction} className="space-y-5">
      {state && !state.ok ? (
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="e.g. Front Desk"
          className={`${CONTROL_CLASS} w-full`}
        />
        <p className="mt-1 text-xs text-gray-500">How you&apos;ll recognise this employee in Denku.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="language" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
            Primary language
          </label>
          {/*
            Options come from the language registry, so this picker cannot offer what the voice
            stack cannot speak.
          */}
          <select
            id="language"
            name="language"
            defaultValue={defaultLanguage}
            className={`${CONTROL_CLASS} w-full`}
          >
            {LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {LANGUAGES[code].label}
              </option>
            ))}
          </select>
          {/*
            Says something different about each channel because the truth is different. Chat
            follows the customer's language with nothing to configure; a call is bound by the
            registry — an ear that transcribes it, a mouth that speaks it. One sentence covering
            both would be false for voice, in the direction that loses a caller.
          */}
          <p className="mt-1 text-xs text-gray-500">
            What it speaks on calls, and its default everywhere.{" "}
            <strong>In chat it replies in whichever language the customer writes in</strong> —
            Turkish, German, anything — no setup needed. Calls are limited to the languages listed
            here; add more under Setup once it is hired.
          </p>
        </div>

        <TimezoneField />
      </div>

      {/* What this hire actually produces, said before the button rather than after. */}
      <div
        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
          willGetPhone
            ? "border-brand-200 bg-brand-50 text-navy-700 dark:border-brand-400/25 dark:bg-brand-400/10 dark:text-white"
            : "border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
        }`}
      >
        {willGetPhone ? (
          <Phone className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>
          {willGetPhone
            ? "This employee gets its own phone number and answers calls on it, plus any chat channels you assign."
            : `This employee answers on chat channels — Telegram, email — and will not have a phone number. ${phoneReason ?? ""}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? "Hiring…" : "Hire"}
        </button>
        <Link
          href="/dashboard/team"
          className="text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:hover:text-gray-200"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

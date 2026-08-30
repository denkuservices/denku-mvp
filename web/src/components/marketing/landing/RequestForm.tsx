"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { SERVICES } from "@/lib/marketing/content/services";
import { Reveal } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * The request form — one page, four intents.
 *
 * Creato splits this into tabs (Chat / Call / Studio / Custom) on `/talep-formu`
 * and it is the right shape: a visitor arrives already knowing which thing they
 * want, and a single generic "contact us" box makes them explain it from scratch.
 *
 * The submit path is the existing `/api/marketing/contact` route and the existing
 * `contact_requests` table — the only change is an allowlisted `source` so these
 * four don't land in one undifferentiated pile.
 *
 * The second path out of this page is the demo line: for anyone who would rather
 * ask than type, the AI employee takes the enquiry itself.
 */

/** Which form field each intent adds. The label and placeholder are translated. */
const EXTRA_FIELD: Record<string, string> = {
  "ai-employees": "estimated_volume",
  "ai-audit": "estimated_volume",
  "ai-studio": "estimated_volume",
  "custom-ai": "tools",
};

export function RequestForm({ initialService }: { initialService?: string }) {
  const t = useTranslations("request");
  const tsv = useTranslations("services");
  const nextSteps = t.raw("next") as string[];
  const valid = SERVICES.some((s) => s.slug === initialService);
  const [active, setActive] = React.useState(
    valid ? (initialService as string) : SERVICES[0].slug
  );
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const service = SERVICES.find((s) => s.slug === active) ?? SERVICES[0];
  const extraName = EXTRA_FIELD[service.slug];

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("work_email") ?? "").trim();

    // Same shape of check the contact form applies before it spends a request.
    if (!email.includes("@") || !email.includes(".")) {
      setError(t("invalidEmail"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/marketing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_email: email,
          name: String(data.get("name") ?? "").trim(),
          company: String(data.get("company") ?? "").trim(),
          message: String(data.get("message") ?? "").trim(),
          [extraName]: String(data.get(extraName) ?? "").trim(),
          source: `request_${service.slug}`,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        form.reset();
        setDone(true);
      } else {
        setError(json.error || t("failed"));
      }
    } catch {
      setError(t("failed"));
    } finally {
      setLoading(false);
    }
  };

  const field =
    "w-full rounded-[12px] border border-[var(--d-border)] bg-[var(--d-surface-glass)] px-4 py-3 text-[15px] text-[var(--d-ink)] placeholder:text-[var(--d-ink-faint)] transition-colors focus:border-[rgba(200,148,104,.5)] focus:outline-none";
  const label =
    "mb-1.5 block font-brand-mono text-[10px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]";

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[1fr_.85fr]">
      <Reveal>
        <div className="landing-glass p-8 md:p-10">
          {/* Intent tabs */}
          <div
            role="tablist"
            aria-label="What are you asking about?"
            className="mb-8 flex flex-wrap gap-2"
          >
            {SERVICES.map((s) => {
              const on = s.slug === active;
              return (
                <button
                  key={s.slug}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setActive(s.slug);
                    setDone(false);
                    setError(null);
                  }}
                  className="rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors"
                  style={{
                    borderColor: on ? "rgba(200,148,104,.45)" : "var(--d-border)",
                    background: on ? "rgba(200,148,104,.12)" : "transparent",
                    color: on ? "var(--d-ink)" : "var(--d-ink-soft)",
                  }}
                >
                  {tsv(`items.${s.slug}.name`)}
                </button>
              );
            })}
          </div>

          {done ? (
            <div role="alert" className="py-10 text-center">
              <div className="font-display text-[26px] font-semibold text-[var(--d-ink)]">
                {t("doneTitle")}
              </div>
              <p className="mt-3 text-[15.5px] text-[var(--d-ink-soft)]">
                {t("doneBody")}
              </p>
              <button
                type="button"
                onClick={() => setDone(false)}
                className="mt-6 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
              >
                {t("sendAnother")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor="req-name">
                    {t("name")}
                  </label>
                  <input id="req-name" name="name" className={field} placeholder="Jane Doe" />
                </div>
                <div>
                  <label className={label} htmlFor="req-email">
                    {t("email")} <span className="text-[var(--d-copper)]">*</span>
                  </label>
                  <input
                    id="req-email"
                    name="work_email"
                    type="email"
                    required
                    className={field}
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div>
                <label className={label} htmlFor="req-company">
                  {t("company")}
                </label>
                <input id="req-company" name="company" className={field} placeholder="Company name" />
              </div>

              <div>
                <label className={label} htmlFor="req-extra">
                  {t(`extra.${service.slug}.label`)}
                </label>
                <input
                  id="req-extra"
                  name={extraName}
                  className={field}
                  placeholder={t(`extra.${service.slug}.placeholder`)}
                />
              </div>

              <div>
                <label className={label} htmlFor="req-message">
                  {t("anythingElse")}
                </label>
                <textarea
                  id="req-message"
                  name="message"
                  rows={4}
                  className={`${field} resize-y`}
                  placeholder={t("anythingElsePlaceholder")}
                />
              </div>

              {error && (
                <p role="alert" className="text-[14px] text-[var(--d-danger)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-full bg-[var(--d-copper)] px-8 py-4 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C] disabled:opacity-60"
              >
                {loading ? t("sending") : t("send")}
                {!loading && <span aria-hidden="true">→</span>}
              </button>

              <p className="text-[12.5px] leading-relaxed text-[var(--d-ink-faint)]">
                {t("privacy")}
              </p>
            </form>
          )}
        </div>
      </Reveal>

      {/* The other way to ask */}
      <Reveal delay={120}>
        <div className="flex h-full flex-col gap-5">
          <div className="landing-sweep landing-glass flex flex-col gap-4 p-8">
            <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-copper)]">
              {t("orTalk")}
            </div>
            <h2 className="font-display text-[24px] font-semibold leading-tight text-[var(--d-ink)]">
              {t("orTalkTitle")}
            </h2>
            <p className="text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
              {t("orTalkBody")}
            </p>
            <Link
              href="/#demo"
              className="mt-2 inline-flex items-center gap-2.5 self-start rounded-full border border-[var(--d-border)] px-6 py-3 text-[14.5px] font-medium text-[var(--d-ink)] transition-colors hover:border-[rgba(200,148,104,.5)]"
            >
              Talk to Denku <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="rounded-[20px] border border-[var(--d-border)] p-7">
            <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
              {t("nextTitle")}
            </div>
            <ol className="mt-4 flex flex-col gap-3">
              {nextSteps.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-[14.5px] text-[var(--d-ink-soft)]">
                  <span className="font-brand-mono text-[11px] text-[var(--d-copper)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

export default RequestForm;

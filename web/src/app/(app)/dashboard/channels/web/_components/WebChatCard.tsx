"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Globe, RefreshCw, Upload } from "lucide-react";
import { Surface, Pill } from "../../../_platform/ui";
import { DEFAULT_THEME, THEME_KEYS, type WebChatTheme } from "@/lib/webchat/theme";
import ColorField from "./ColorField";
import WebChatPreview from "./WebChatPreview";
import {
  assignWebChatEmployeeAction,
  createWebChatAction,
  removeWebChatAction,
  removeWebChatAvatarAction,
  rotateWebChatKeyAction,
  setWebChatStatusAction,
  updateWebChatAction,
  updateWebChatAvatarAction,
} from "../_actions";
import { CONTROL_CLASS } from "@/components/ui-horizon/controls";
import { horizonButtonClass } from "@/components/ui-horizon/button";
import { DANGER_NOTICE_CLASS } from "@/components/ui-horizon/notice";

export interface WebChatSummary {
  id: string;
  siteKey: string;
  siteName: string | null;
  allowedOrigins: string[];
  displayName: string | null;
  headerSubtitle: string | null;
  /** Where the widget loads the header picture from — the built-in one, or this install's own. */
  avatarUrl: string;
  hasCustomAvatar: boolean;
  accentColor: string | null;
  greeting: string | null;
  theme: WebChatTheme;
  status: "connected" | "disconnected" | "error";
  lastError: string | null;
  lastInboundAt: string | null;
  assignedAgentId: string | null;
}

export interface EmployeeOption {
  id: string;
  name: string;
}

/**
 * The install surface for the website widget.
 *
 * Two things are load-bearing here, and both are honesty rather than decoration:
 *
 * - **The domain field is not optional.** An install with no allowed website is refused by the
 *   embed endpoint, on purpose. Presenting the snippet without asking for the domain would ship
 *   a customer a widget that silently does nothing, which is the exact class of failure this
 *   product has been bitten by before.
 * - **"Live" is not claimed until a real message has arrived.** A widget that has been pasted but
 *   never used is described as waiting, and the copy says how to check.
 */
export function WebChatCard({
  connection,
  employees,
  canManage,
  scriptOrigin,
}: {
  connection: WebChatSummary | null;
  employees: EmployeeOption[];
  canManage: boolean;
  /** Where the loader is served from — shown verbatim in the snippet the customer copies. */
  scriptOrigin: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  /**
   * The colours as the owner is choosing them — not what is saved.
   *
   * Held here rather than read from the form on submit because the preview repaints from it on
   * every change. Save is still what persists; this is the "what would it look like" copy.
   */
  const [theme, setTheme] = useState<WebChatTheme>(connection?.theme ?? {});
  /**
   * Bumped on every successful save so the preview re-fetches.
   *
   * `revalidatePath` refreshes the server components on this page, but the preview is an iframe
   * holding a separately-rendered document — nothing about a server action reaches inside it. So
   * saving a new header name changed the form and left the preview showing the old one, which is
   * worse than no preview: two answers to the same question, side by side.
   */
  const [previewVersion, setPreviewVersion] = useState(0);
  const avatarInput = React.useRef<HTMLInputElement>(null);
  const setColor = (key: (typeof THEME_KEYS)[number], next: string) =>
    setTheme((prev) => ({ ...prev, [key]: next || undefined }));

  /**
   * Choosing the file IS the save.
   *
   * The picture does not live in the settings form below it, and deliberately: an owner who picks
   * a logo and then wanders off without pressing Save has, in every product they have ever used,
   * changed their logo. Uploading on selection is also what lets the preview beside them show the
   * real thing a second later, which is the whole reason the preview is a live widget.
   */
  function pickAvatar(file: File | null | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    run(() => updateWebChatAvatarAction(connection!.id, fd), "Picture updated");
  }

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const snippet = connection
    ? `<script>\n  window.DENKU_CHAT = { siteKey: "${connection.siteKey}" };\n</script>\n<script async src="${scriptOrigin}/widget.js"></script>`
    : "";

  function run(action: () => Promise<{ ok: boolean; error?: string }>, savedLabel?: string) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      if (savedLabel) setSaved(savedLabel);
      // What the visitor would now see, rather than what they would have seen before the save.
      setPreviewVersion((v) => v + 1);
    });
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the snippet and copy it manually.");
    }
  }

  const live = connection?.status === "connected" && Boolean(connection.lastInboundAt);
  const unconfigured = connection && connection.allowedOrigins.length === 0;

  if (!connection) {
    return (
      <div className="flex flex-col gap-4">
        <Surface>
          <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Add chat to your website</h2>
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
            You will get two lines of code to paste before <span className="font-mono">&lt;/body&gt;</span> on
            your site. Visitors chat with your AI Employee, and every conversation appears in your Inbox
            where you can take over at any time.
          </p>

          <form action={(fd) => run(() => createWebChatAction(fd))} className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="allowed_origins" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Your website address
              </label>
              {/* A textarea, not an input.
                  The field has always accepted a list — it splits on commas, spaces and newlines —
                  but a single-line box says "one address" while quietly meaning "as many as you
                  like". The owner of the first real install had to ask where the second address
                  went, which is the question a form should never make someone ask. */}
              <textarea
                id="allowed_origins"
                name="allowed_origins"
                required
                rows={2}
                placeholder={"yourshop.com\nyourshop.myshopify.com"}
                className={`mt-1.5 w-full ${CONTROL_CLASS} h-auto py-2`}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                One per line. The widget only runs on the sites you list here — nobody else can put
                your AI on their page. Type each one however you say it out loud;{" "}
                <span className="font-mono">www.</span> is covered either way.
              </p>
              {/* Shopify, Wix and Squarespace all serve a second address alongside the custom
                  domain, and a customer testing from the theme editor is on that one. They will not
                  think of it, and the symptom — the widget works on the live site but not while
                  they are editing it — reads as a bug in our product. */}
              <p className="mt-1.5 text-xs text-gray-500">
                On Shopify, Wix or Squarespace, add your builder address too (for example{" "}
                <span className="font-mono">yourshop.myshopify.com</span>) — the theme editor and
                previews run there.
              </p>
            </div>

            <div>
              <label htmlFor="site_name" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Name this install <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="site_name"
                name="site_name"
                placeholder="Main website"
                className={`mt-1.5 w-full ${CONTROL_CLASS}`}
              />
            </div>

            {/* With one employee there is nothing to ask: creating assigns it. */}
            {employees.length > 1 ? (
              <div>
                <label htmlFor="agent_id" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                  Employee to answer here
                </label>
                <select
                  id="agent_id"
                  name="agent_id"
                  className={`mt-1.5 w-full max-w-md ${CONTROL_CLASS}`}
                >
                  <option value="">Choose an employee</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={pending || !canManage}
              className={`w-full ${horizonButtonClass("primary")} sm:w-auto`}
            >
              {pending ? "Creating…" : "Create the widget"}
            </button>
          </form>
        </Surface>

        {error ? <ErrorNote text={error} /> : null}
      </div>
    );
  }

  return (
    /**
     * Two columns, and the preview is one of them.
     *
     * It used to sit behind an "Open preview" button, below everything else. That was wrong for
     * the job this screen actually does: the owner is choosing colours, and a preview you have to
     * open — and then scroll back to — cannot show you what the choice looks like while you are
     * making it. It is sticky so it stays beside whichever setting is being edited, and it
     * collapses under the form on a narrow screen rather than being hidden.
     */
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
      <Surface>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Globe className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-navy-700 dark:text-white">
                {connection.siteName || connection.allowedOrigins[0] || "Your website"}
              </p>
              {connection.status === "disconnected" ? (
                <p className="mt-1 text-xs text-gray-500">Switched off — the widget does not load on your site.</p>
              ) : unconfigured ? (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>No website listed yet, so the widget will not load anywhere. Add your domain below.</span>
                </p>
              ) : live ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Answering messages
                </p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">
                  Installed — waiting for the first message. Open your site and say hello in the chat bubble.
                </p>
              )}
            </div>
          </div>
          <Pill
            tone={connection.status === "error" || unconfigured ? "critical" : live ? "ok" : "neutral"}
            dot
          >
            {connection.status === "disconnected" ? "Off" : unconfigured ? "Needs a domain" : live ? "Live" : "Waiting"}
          </Pill>
        </div>

        {employees.length > 0 ? (
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-white/10">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Which AI Employee answers here
            </label>
            <select
              defaultValue={connection.assignedAgentId ?? ""}
              disabled={!canManage || pending}
              onChange={(e) =>
                run(() => assignWebChatEmployeeAction(connection.id, e.target.value || null), "Saved")
              }
              className={`mt-1.5 w-full max-w-md ${CONTROL_CLASS}`}
            >
              {connection.assignedAgentId ? null : (
                <option value="">
                  {employees.length === 1
                    ? `Not assigned — ${employees[0].name} answers by default`
                    : "Not assigned — choose an employee"}
                </option>
              )}
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </Surface>

      <Surface>
        <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Paste this on your website</h2>
        <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
          Put it just before the closing <span className="font-mono">&lt;/body&gt;</span> tag, on every page
          you want the chat on. Nothing else to install.
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50/60 dark:border-white/10 dark:bg-white/5">
          <pre className="p-4 font-mono text-[11px] leading-relaxed text-navy-700 dark:text-gray-200">
            {snippet}
          </pre>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copySnippet}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy snippet"}
          </button>
          <p className="text-xs text-gray-500">
            The key in it is public — it is meant to be in your page source. What protects you is the
            website list, not the key.
          </p>
        </div>
      </Surface>

      <Surface>
        <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Settings</h2>

        <form
          action={(fd) => run(() => updateWebChatAction(connection.id, fd), "Settings saved")}
          className="mt-3 flex flex-col gap-3"
        >
          <div>
            <label htmlFor="allowed_origins" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Websites allowed to show this chat
            </label>
            <textarea
              id="allowed_origins"
              name="allowed_origins"
              rows={3}
              defaultValue={connection.allowedOrigins.join("\n")}
              placeholder="yourshop.com"
              className={`mt-1.5 w-full ${CONTROL_CLASS} h-auto py-2 font-mono text-xs`}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              One per line. <span className="font-mono">www.</span> is added for you. Use{" "}
              <span className="font-mono">*.yourshop.com</span> only if you want every subdomain
              (blog, staging, shop) to run the widget. Empty means it loads nowhere.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="site_name" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Install name
              </label>
              <input
                id="site_name"
                name="site_name"
                defaultValue={connection.siteName ?? ""}
                className={`mt-1.5 w-full ${CONTROL_CLASS}`}
              />
            </div>
            <div>
              <label htmlFor="display_name" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Name in the chat header
              </label>
              <input
                id="display_name"
                name="display_name"
                defaultValue={connection.displayName ?? ""}
                placeholder={employees[0]?.name ?? "Assistant"}
                className={`mt-1.5 w-full ${CONTROL_CLASS}`}
              />
            </div>
            <div>
              <label htmlFor="header_subtitle" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Role under the name
              </label>
              <input
                id="header_subtitle"
                name="header_subtitle"
                defaultValue={connection.headerSubtitle ?? ""}
                placeholder="Customer Support"
                className={`mt-1.5 w-full ${CONTROL_CLASS}`}
              />
              {/* Empty is a real answer, not a gap: the widget writes its own line, in the
                  visitor's language, which is better than an English one for most of them. */}
              <p className="mt-1.5 text-xs text-gray-500">
                Leave empty for a line in the visitor&apos;s own language.
              </p>
            </div>
          </div>

          {/* Directly under the name and the role, because the three are one thing: what a
              visitor sees at the top of the panel. Split apart, a shop ends up with its own logo
              beside a header that still says "Assistant". */}
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">Picture in the chat header</p>
            <p className="mt-1 text-xs text-gray-500">
              Leave it as it is and your visitors see a friendly support agent; upload your own
              logo or a photo of your team to make it yours.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- a runtime storage URL, not a
                  build-time asset: next/image would try to optimise a route it cannot know the
                  dimensions of, for a 38px circle. */}
              <img
                src={`${connection.avatarUrl}${connection.avatarUrl.includes("?") ? "&" : "?"}r=${previewVersion}`}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-gray-200 bg-white object-cover dark:border-white/10"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={avatarInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    pickAvatar(e.target.files?.[0]);
                    // Cleared so picking the same file twice still fires a change event.
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={pending || !canManage}
                  onClick={() => avatarInput.current?.click()}
                  className={`inline-flex items-center gap-1.5 ${horizonButtonClass("secondary", "sm")}`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload a picture
                </button>
                {connection.hasCustomAvatar ? (
                  <button
                    type="button"
                    disabled={pending || !canManage}
                    onClick={() =>
                      run(() => removeWebChatAvatarAction(connection.id), "Default picture restored")
                    }
                    className={`${horizonButtonClass("secondary", "sm")}`}
                  >
                    Use the default
                  </button>
                ) : null}
                <p className="w-full text-xs text-gray-500">PNG, JPG or WebP, up to 512 KB. Square looks best.</p>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="greeting" className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              First thing the chat says
            </label>
            <input
              id="greeting"
              name="greeting"
              defaultValue={connection.greeting ?? ""}
              placeholder="Hi! How can we help?"
              className={`mt-1.5 w-full ${CONTROL_CLASS}`}
            />
            {/* Said by the widget, not stored as a message — so it never shows up in the Inbox
                as something the business typed. */}
            <p className="mt-1.5 text-xs text-gray-500">Shown before anyone types. Not saved as a message.</p>
          </div>

          <div className="border-t border-gray-100 pt-3 dark:border-white/10">
            <p className="text-xs font-semibold text-navy-700 dark:text-white">Colours</p>
            <p className="mt-1 text-xs text-gray-500">
              The preview repaints as you choose. Pick one brand colour and the rest follow — change
              the others only if you need to.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ColorField
                id="theme_accent"
                name="theme_accent"
                label="Brand colour"
                hint="Chat bubble, your visitor's messages, Send."
                value={theme.accent ?? ""}
                fallback={DEFAULT_THEME.accent}
                onChange={(v) => setColor("accent", v)}
              />
              <ColorField
                id="theme_surface"
                name="theme_surface"
                label="Chat background"
                value={theme.surface ?? ""}
                fallback={DEFAULT_THEME.surface}
                onChange={(v) => setColor("surface", v)}
              />
              <ColorField
                id="theme_headerBg"
                name="theme_headerBg"
                label="Header background"
                hint="Defaults to your brand colour."
                value={theme.headerBg ?? ""}
                fallback={theme.accent || DEFAULT_THEME.headerBg}
                onChange={(v) => setColor("headerBg", v)}
              />
              <ColorField
                id="theme_headerText"
                name="theme_headerText"
                label="Header text"
                hint="Go dark if your brand colour is light."
                value={theme.headerText ?? ""}
                fallback={DEFAULT_THEME.headerText}
                onChange={(v) => setColor("headerText", v)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending || !canManage}
              className={`${horizonButtonClass("primary")}`}
            >
              {pending ? "Saving…" : "Save settings"}
            </button>
            {saved ? (
              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {saved}
              </span>
            ) : null}
          </div>
        </form>
      </Surface>

      {canManage ? (
        <Surface>
          <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Manage</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    setWebChatStatusAction(
                      connection.id,
                      connection.status === "connected" ? "disconnected" : "connected"
                    ),
                  connection.status === "connected" ? "Widget switched off" : "Widget switched on"
                )
              }
              className={`${horizonButtonClass("secondary", "sm")}`}
            >
              {connection.status === "connected" ? "Switch off" : "Switch on"}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!confirmRotate) {
                  setConfirmRotate(true);
                  return;
                }
                setConfirmRotate(false);
                run(() => rotateWebChatKeyAction(connection.id), "New key issued");
              }}
              className={`inline-flex items-center gap-1.5 ${horizonButtonClass("secondary", "sm")}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {confirmRotate ? "Confirm — old snippet stops working" : "Issue a new key"}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeWebChatAction(connection.id))}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:hover:bg-red-500/10"
            >
              Remove widget
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Removing the widget stops it loading and forgets its settings. Conversations it already
            produced stay in your Inbox.
          </p>
        </Surface>
      ) : null}

      {connection.status === "error" && connection.lastError ? <ErrorNote text={connection.lastError} /> : null}
      {error ? <ErrorNote text={error} /> : null}
      </div>

      <div className="xl:sticky xl:top-4">
        <Surface>
          <WebChatPreview
            origin={scriptOrigin}
            siteKey={connection.siteKey}
            theme={theme}
            reloadKey={previewVersion}
          />
        </Surface>
      </div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className={`${DANGER_NOTICE_CLASS}`}>
      {text}
    </div>
  );
}

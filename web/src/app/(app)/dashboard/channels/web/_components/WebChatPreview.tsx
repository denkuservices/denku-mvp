"use client";

import React from "react";
import { MessageCircle } from "lucide-react";
import { DEFAULT_THEME, type WebChatTheme } from "@/lib/webchat/theme";

/**
 * The widget, as the owner's own visitors will see it — repainting as they choose colours.
 *
 * **It is the real widget, in a real iframe, not a mock.** The embed endpoint accepts a
 * Denku-origin parent alongside the customer's allowlist precisely so this can exist: same
 * document, same session, same AI. A mock would have been easier and would have told the owner
 * nothing about whether their install actually works — which is the one question a preview is
 * for.
 *
 * Colours arrive by `postMessage` rather than by reloading the iframe. Reloading on every
 * keystroke of a colour picker would open a visitor session per change and flash the panel; the
 * message repaints CSS variables in place, instantly. The widget re-validates every value before
 * it touches the DOM (`app.js`), so this component cannot be the path that smuggles something
 * that is not a colour into a page.
 *
 * The launcher bubble is drawn here rather than shown from inside the iframe: the real one is
 * `position: fixed` on the customer's own page, outside the panel entirely, so the only honest
 * way to show it next to the panel is to draw it.
 */
export default function WebChatPreview({
  origin,
  siteKey,
  theme,
}: {
  /** Where the widget document is served from. */
  origin: string;
  siteKey: string;
  /** Live values from the form — not what is saved. */
  theme: WebChatTheme;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = React.useState(false);

  const accent = theme.accent || DEFAULT_THEME.accent;

  // Repaint on every change, and once more when the iframe finishes loading — a colour chosen
  // before it was ready would otherwise be lost until the next keystroke.
  React.useEffect(() => {
    if (!ready) return;
    const target = frame.current?.contentWindow;
    if (!target) return;
    target.postMessage({ source: "denku-chat-host", type: "theme", theme }, origin);
  }, [theme, ready, origin]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-navy-700 dark:text-white">Preview</h2>
        <span className="text-[11px] text-gray-400">live widget</span>
      </div>

      <div
        className="rounded-2xl border border-gray-200 p-4 dark:border-white/10"
        // The panel sits on a neutral page so the chosen colours are judged against something,
        // rather than against the dashboard's own background.
        style={{ background: "repeating-linear-gradient(45deg,#f8f8f7,#f8f8f7 10px,#f2f2f0 10px,#f2f2f0 20px)" }}
      >
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
          <iframe
            ref={frame}
            title="Web chat preview"
            src={`${origin}/embed/chat?k=${encodeURIComponent(siteKey)}`}
            onLoad={() => setReady(true)}
            className="block h-[460px] w-full bg-white"
          />
        </div>

        {/* The closed state: what a visitor sees before they click anything. */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-[11px] text-gray-500">Closed</span>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: accent }}
            aria-hidden="true"
          >
            <MessageCircle className="h-5 w-5" />
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        This is the live widget. Anything you type here is a real conversation and appears in your
        Inbox. Colours update as you pick them; press Save to keep them.
      </p>
    </div>
  );
}

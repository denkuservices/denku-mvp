/**
 * Denku Web Chat loader.
 *
 * The only Denku code that ever runs in a customer's own page, and it is deliberately the
 * smallest thing that can work: it draws a launcher button, and when someone clicks it, it opens
 * an iframe pointing at Denku. The conversation, the network calls and the visitor's words all
 * live inside that iframe, on our origin — so a bug in the chat cannot read the customer's DOM,
 * their forms, or their cookies, and their CSS cannot break the chat.
 *
 * Installed with two tags and nothing else:
 *
 *   <script>window.DENKU_CHAT = { siteKey: "dkweb_..." };</script>
 *   <script async src="https://denku.io/widget.js"></script>
 *
 * No build step, no framework, ES5 syntax on purpose: this file is loaded by whatever browser
 * the customer's customers happen to use, on a page we do not control and cannot test.
 */
(function () {
  "use strict";

  var config = window.DENKU_CHAT || window.DENKU_CHAT_CONFIG || {};
  var siteKey = String(config.siteKey || config.key || "").trim();
  if (!siteKey) {
    // Loud, because the only person who sees a browser console here is the developer installing
    // it, and silence would leave them with a page that simply has no chat on it.
    console.error("[Denku] window.DENKU_CHAT.siteKey is missing — the chat widget will not load.");
    return;
  }

  if (window.__denkuChatLoaded) return;
  window.__denkuChatLoaded = true;

  // The Denku origin is read from this script's own URL rather than hardcoded, so the same file
  // works on production, a preview deployment and a developer's localhost with no edit.
  var script = document.currentScript;
  if (!script) {
    // `document.currentScript` is null when the tag is a module. Find ourselves the slow way
    // rather than refusing to load over a detail of how the customer pasted the snippet.
    var candidates = document.querySelectorAll('script[src*="/widget.js"]');
    script = candidates.length ? candidates[candidates.length - 1] : null;
  }
  var base = script && script.src ? script.src.replace(/\/widget\.js.*$/, "") : "";
  if (!base) return;

  var STORAGE_KEY = "denku_chat_visitor";
  var SEEN_KEY = "denku_chat_seen_at";
  var side = config.position === "left" ? "left" : "right";

  /**
   * `denku.io` and `www.denku.io` are the same Denku, and a domain that redirects between them
   * would otherwise break this widget silently.
   *
   * The snippet names one of the two; if the server redirects to the other, the iframe ends up on
   * an origin that is not the one this script was loaded from, every `postMessage` is refused by
   * the browser for mismatched origin, and the handshake never completes. The widget still limps —
   * app.js starts a session on its own after a moment — but the visitor id never reaches it, so
   * every page load looks like a new person to the shop owner, and the close button does nothing.
   *
   * So the host origin is *confirmed* by the iframe's first message rather than assumed: we accept
   * that message from the origin we expected OR from its www/apex sibling, and talk to whichever
   * one actually answered. Nothing wider is accepted — a third-party origin is still refused.
   */
  function sibling(origin) {
    if (origin.indexOf("://www.") !== -1) return origin.replace("://www.", "://");
    return origin.replace("://", "://www.");
  }

  function isOurOrigin(origin) {
    return origin === base || origin === sibling(base);
  }

  /**
   * The visitor id lives in the CUSTOMER's storage, not ours.
   *
   * Storage inside a third-party iframe is partitioned or blocked outright by Safari and, more
   * and more, by everyone else — so an id kept there would be forgotten between page loads and
   * every visit would look like a new person to the shop owner. Kept here it is first-party,
   * reliable, and it is not a credential: the worst a forged one does is rejoin a conversation
   * whose id the forger already had.
   */
  function visitorId() {
    try {
      var existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;
      var minted = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(STORAGE_KEY, minted);
      return minted;
    } catch (e) {
      // Private mode, or storage disabled. The visitor still gets a conversation; it just does
      // not survive the page.
      return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
  }

  /**
   * How far this visitor has read, kept on the CUSTOMER's origin.
   *
   * First-party storage, for the same reason the visitor id is: an iframe on our domain is
   * third-party here, and its storage is partitioned or blocked outright. Kept there, the widget
   * would forget between page loads and greet a returning visitor with a badge for a reply they
   * read yesterday.
   */
  function seenAt() {
    try {
      return window.localStorage.getItem(SEEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function rememberSeen(at) {
    try {
      window.localStorage.setItem(SEEN_KEY, at);
    } catch (e) {
      /* private mode: the badge simply resets with the page */
    }
  }

  var styles =
    ".denku-launcher{position:fixed;bottom:20px;" +
    side +
    ":20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;z-index:2147483000;" +
    "background:#1B6E6E;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;align-items:center;" +
    "justify-content:center;transition:transform .15s ease}" +
    ".denku-launcher:hover{transform:scale(1.05)}" +
    ".denku-launcher svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:2}" +
    ".denku-frame{position:fixed;bottom:88px;" +
    side +
    ":20px;width:380px;height:min(620px,calc(100vh - 120px));border:0;border-radius:16px;" +
    "box-shadow:0 12px 48px rgba(0,0,0,.22);z-index:2147483000;background:#fff;display:none;" +
    "color-scheme:light}" +
    ".denku-frame.denku-open{display:block}" +
    /* The badge. Sits on the launcher, not in the panel — the whole point is to be visible when
       the panel is not. Its colours are fixed rather than themed: a business could otherwise
       pick an accent that renders its own unread count invisible. */
    ".denku-badge{position:absolute;top:-2px;" +
    (side === "left" ? "left" : "right") +
    ":-2px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#E5484D;color:#fff;" +
    "font:600 11px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;" +
    "box-shadow:0 0 0 2px #fff;pointer-events:none}" +
    "@media (max-width:480px){.denku-frame{width:calc(100vw - 24px);height:calc(100vh - 108px);" +
    side +
    ":12px;bottom:80px}}";

  var sheet = document.createElement("style");
  sheet.textContent = styles;
  document.head.appendChild(sheet);

  var launcher = document.createElement("button");
  launcher.className = "denku-launcher";
  // Inline, not only in the class: the badge is positioned against the launcher, and a customer
  // stylesheet that happens to reset `position` on buttons would otherwise send it to the corner
  // of the page. An inline style is the one thing their CSS cannot outrank.
  launcher.style.position = "fixed";
  launcher.type = "button";
  launcher.setAttribute("aria-label", config.launcherLabel || "Open chat");
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 20.5l1.4-5.2A8.5 8.5 0 1 1 21 11.5z" stroke-linejoin="round"/></svg>';
  if (config.accentColor) launcher.style.background = config.accentColor;

  var frame = null;
  var open = false;
  var badge = null;

  /**
   * Draw (or clear) the unread count on the launcher.
   *
   * Capped at 9+ because the number stops being information past that — what a visitor needs to
   * know is "somebody answered", not how many sentences it took.
   */
  function setBadge(count) {
    var n = typeof count === "number" && count > 0 ? count : 0;
    if (!n) {
      if (badge) {
        badge.parentNode.removeChild(badge);
        badge = null;
      }
      launcher.setAttribute("aria-label", open ? "Close chat" : "Open chat");
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "denku-badge";
      launcher.appendChild(badge);
    }
    badge.textContent = n > 9 ? "9+" : String(n);
    // Screen readers get the count in words; the badge itself is decorative to them.
    launcher.setAttribute("aria-label", n === 1 ? "Open chat, 1 new message" : "Open chat, " + n + " new messages");
  }
  // Where the iframe actually lives. Starts as the origin the snippet named and is corrected to
  // the real one the moment the iframe speaks.
  var frameOrigin = base;

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement("iframe");
    frame.className = "denku-frame";
    frame.title = "Chat";
    /**
     * `referrerpolicy="origin"` is load-bearing, not tidiness.
     *
     * Denku decides whether this widget may run by reading the embedding page's origin from the
     * `Referer` header on THIS request — it is the only thing in the exchange a page script
     * cannot forge. A site with `Referrer-Policy: no-referrer` would otherwise strip it and the
     * widget would be refused on a perfectly legitimate install. Set on the element, it wins
     * over the page's own policy.
     */
    frame.setAttribute("referrerpolicy", "origin");
    frame.setAttribute("allow", "clipboard-write");
    frame.src = base + "/embed/chat?k=" + encodeURIComponent(siteKey);
    document.body.appendChild(frame);
    return frame;
  }

  function setOpen(next) {
    open = next;
    var el = ensureFrame();
    if (next) {
      el.classList.add("denku-open");
      // The page context is sent over postMessage, never in the iframe URL: a page URL can carry
      // a reset token or an order id, and a URL ends up in logs, history and referrers.
      post({ type: "open" });
    } else {
      el.classList.remove("denku-open");
      // The widget stops counting while it is showing, and starts again from here.
      post({ type: "closed" });
    }
    if (next) setBadge(0);
    else launcher.setAttribute("aria-label", "Open chat");
  }

  function post(message) {
    if (!frame || !frame.contentWindow) return;
    message.source = "denku-chat-host";
    // Always addressed to Denku's exact origin — never "*", which would broadcast the page URL
    // to whatever happens to be in the frame. `frameOrigin` is the origin that actually answered,
    // which is not always the one the snippet named (see the www/apex note above).
    frame.contentWindow.postMessage(message, frameOrigin);
  }

  launcher.addEventListener("click", function () {
    setOpen(!open);
  });

  window.addEventListener("message", function (event) {
    if (!isOurOrigin(event.origin)) return;
    var data = event.data;
    if (!data || data.source !== "denku-chat") return;

    // Talk back to whichever of the two answered, not to the one we guessed.
    frameOrigin = event.origin;

    if (data.type === "ready") {
      post({
        type: "init",
        visitorId: visitorId(),
        seenAt: seenAt(),
        pageUrl: location.href,
        referrer: document.referrer || null,
        locale: navigator.language || null,
      });
      return;
    }
    if (data.type === "close") setOpen(false);
    if (data.type === "unread") setBadge(data.count);
    if (data.type === "seen" && typeof data.at === "string") rememberSeen(data.at);
  });

  function mount() {
    document.body.appendChild(launcher);
    if (config.autoOpen === true) {
      setOpen(true);
      return;
    }

    /**
     * A visitor who has chatted here before gets the frame loaded quietly, closed.
     *
     * Without this the widget only starts polling once someone clicks it, so a reply the shop
     * owner typed from the Inbox last night would be invisible until the visitor happened to open
     * the chat — which is precisely the moment they no longer need telling. Loading it lets the
     * badge be there when they arrive.
     *
     * Only for a returning visitor, and never for a first-time one: someone who has never spoken
     * to this business has no reply waiting, and their first page load should not pay for an
     * iframe to discover that.
     */
    var returning = false;
    try {
      returning = Boolean(window.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      returning = false;
    }
    if (returning) ensureFrame();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();

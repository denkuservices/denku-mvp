import Script from "next/script";

/**
 * Denku's own chat widget, on Denku's own site.
 *
 * This is not a mockup of the product and it is not a bespoke marketing chatbot. It is the exact
 * snippet a customer pastes into their own page, loading the same `widget.js`, pointed at a real
 * Web Chat connection on a real workspace (`Denku`, `is_internal`), answered by the same reply
 * engine every customer's AI runs on. A visitor asking about pricing is talking to the product.
 *
 * That is the point of putting it here rather than building something for the landing page: if
 * this breaks, it has broken for every customer with a widget on their site, and we find out on
 * our own page first instead of in a support message.
 *
 * **The site key is public on purpose.** It is an ADDRESS, not a password — the access control is
 * the connection's origin allowlist, checked against the browser-set `Referer` on the iframe
 * document request at `/embed/chat`. Both denku.io and www.denku.io are on that list, because the
 * apex redirects to www but a browser sends the Referer of whichever page it is actually on. A
 * key pasted somewhere else reaches a refusal, which is the design (see
 * `skills/webchat-integration.md`).
 *
 * `afterInteractive` rather than `beforeInteractive`: nothing on the page waits for the widget,
 * and the launcher appearing a beat after the hero is the correct trade for not delaying it.
 */

/** Created by `scripts/provision-denku-workspace.mts`. Public by design — see above. */
const DENKU_SITE_KEY = "dkweb_35bb1371214f9acd8ae91d16691b5395";

export function DenkuChatWidget() {
  return (
    <>
      <Script id="denku-chat-config" strategy="afterInteractive">
        {`window.DENKU_CHAT = { siteKey: ${JSON.stringify(DENKU_SITE_KEY)} };`}
      </Script>
      <Script id="denku-chat-widget" src="/widget.js" strategy="afterInteractive" />
    </>
  );
}

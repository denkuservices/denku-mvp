import { NextRequest, NextResponse } from "next/server";
import { getConnectionBySiteKey } from "@/lib/webchat/connections";
import { isOriginAllowed, normalizeOrigin } from "@/lib/webchat/origins";
import { issueFrameToken, isTokenSigningConfigured } from "@/lib/webchat/token";
import { isSelfOrigin, selfOrigins } from "@/lib/webchat/http";
import { resolveTheme } from "@/lib/webchat/theme";

export const dynamic = "force-dynamic";

/**
 * The widget document — and the one place in this channel where a browser tells the truth about
 * whose website the visitor is on.
 *
 * The loader on the customer's page creates an iframe pointing here. The browser sets `Referer`
 * on that document request to the embedding page's origin, and a page script cannot forge it.
 * That is the entire reason this endpoint exists as a route handler rather than a React page:
 * it has to read a request header, check it against the install's allowlist, and put the result
 * into a signature that every later API call carries. Everything downstream trusts the token,
 * not the request.
 *
 * Two defences, deliberately both:
 *
 *   - **The Referer check** decides whether we serve the widget at all, and what the frame token
 *     says. A hostile site loading this URL in its own page is refused here.
 *   - **`frame-ancestors`** is set per connection, from the customer's own allowlist, so the
 *     browser independently refuses to render the iframe anywhere else. This one is set on the
 *     response directly — the app-wide `frame-ancestors 'self'` in `next.config.ts` is excluded
 *     for `/embed/*` precisely so it cannot fight with this.
 *
 * What neither defence covers, honestly: a script that is not a browser can send any `Referer`
 * it likes, get a frame token, and call the API. That is irreducible for a public endpoint with
 * a public key. It is why the volume caps in `lib/webchat/sessions.ts` exist and why the
 * embedding origin is logged.
 */

function html(body: string, status: number, headers: Record<string, string> = {}) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Never cached: the response embeds a short-lived token and depends on the Referer.
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

const PROBLEM_COPY: Record<string, Record<string, string>> = {
  "Missing site key.": { es: "Falta la clave del sitio.", de: "Website-Schlüssel fehlt.", tr: "Site anahtarı eksik." },
  "Chat is not configured on this deployment.": { es: "El chat no está configurado en este despliegue.", de: "Der Chat ist in dieser Bereitstellung nicht eingerichtet.", tr: "Sohbet bu dağıtımda yapılandırılmadı." },
  "Unknown site key.": { es: "Clave de sitio desconocida.", de: "Unbekannter Website-Schlüssel.", tr: "Site anahtarı tanınmıyor." },
  "This chat widget is switched off.": { es: "Este widget de chat está desactivado.", de: "Dieses Chat-Widget ist ausgeschaltet.", tr: "Bu sohbet bileşeni kapalı." },
  "This chat widget has no allowed website yet. Add your domain in Denku → Channels → Web Chat.": { es: "Este widget aún no tiene un sitio permitido. Añade tu dominio en Denku → Canales → Chat web.", de: "Für dieses Chat-Widget ist noch keine Website zugelassen. Fügen Sie Ihre Domain unter Denku → Kanäle → Web-Chat hinzu.", tr: "Bu sohbet bileşeni için henüz izin verilen bir site yok. Alan adınızı Denku → Kanallar → Web sohbeti bölümünden ekleyin." },
  "This chat widget must be embedded from an allowed website.": { es: "Este widget debe integrarse desde un sitio permitido.", de: "Dieses Chat-Widget muss von einer zugelassenen Website eingebettet werden.", tr: "Bu sohbet bileşeni izin verilen bir siteden yerleştirilmelidir." },
};

/** A refusal a developer installing the widget can act on, and a visitor never sees. */
function problemPage(message: string, status: number, locale = "en") {
  let translated = PROBLEM_COPY[message]?.[locale] ?? message;
  const originMatch = message.match(/^This chat widget is not allowed on (.+)\. Add it in Denku → Channels → Web Chat\.$/);
  if (originMatch && locale !== "en") {
    translated = locale === "es"
      ? `Este widget no está permitido en ${originMatch[1]}. Añádelo en Denku → Canales → Chat web.`
      : locale === "de"
        ? `Dieses Chat-Widget ist auf ${originMatch[1]} nicht zugelassen. Fügen Sie es unter Denku → Kanäle → Web-Chat hinzu.`
        : `Bu sohbet bileşenine ${originMatch[1]} üzerinde izin verilmiyor. Denku → Kanallar → Web sohbeti bölümünden ekleyin.`;
  }
  return html(
    `<!doctype html><meta charset="utf-8"><title>Denku Chat</title>` +
      `<body lang="${locale}" style="margin:0;font:14px system-ui,sans-serif;color:#5b6472;padding:16px">${translated}</body>`,
    status
  );
}

export async function GET(req: NextRequest) {
  const requestedLocale = req.nextUrl.searchParams.get("locale") ?? "en";
  const locale = ["en", "es", "de", "tr"].includes(requestedLocale) ? requestedLocale : "en";
  const siteKey = (req.nextUrl.searchParams.get("k") ?? "").trim();
  if (!siteKey) return problemPage("Missing site key.", 400, locale);

  if (!isTokenSigningConfigured()) {
    console.error("[WEBCHAT][EMBED][NO_SIGNING_KEY]");
    return problemPage("Chat is not configured on this deployment.", 503, locale);
  }

  const connection = await getConnectionBySiteKey(siteKey);
  if (!connection) return problemPage("Unknown site key.", 404, locale);
  if (connection.status !== "connected") return problemPage("This chat widget is switched off.", 403, locale);

  if (connection.allowedOrigins.length === 0) {
    // Not an error state — an unfinished install. Saying so is what stops a customer pasting the
    // snippet, seeing nothing, and concluding the product is broken.
    return problemPage(
      "This chat widget has no allowed website yet. Add your domain in Denku → Channels → Web Chat.",
      403,
      locale,
    );
  }

  const parentOrigin = normalizeOrigin(req.headers.get("referer"));
  const allowed =
    (!!parentOrigin && isOriginAllowed(parentOrigin, connection.allowedOrigins)) ||
    // Our own dashboard previewing the widget it just configured — on either of our hosts.
    isSelfOrigin(parentOrigin);

  if (!allowed) {
    console.warn("[WEBCHAT][EMBED][REFUSED]", {
      connection_id: connection.id,
      referer: parentOrigin ?? "none",
    });
    return problemPage(
      parentOrigin
        ? `This chat widget is not allowed on ${parentOrigin}. Add it in Denku → Channels → Web Chat.`
        : "This chat widget must be embedded from an allowed website.",
      403,
      locale,
    );
  }

  const frameToken = issueFrameToken({
    cid: connection.id,
    org: connection.orgId,
    po: parentOrigin as string,
  });

  const boot = JSON.stringify({
    frameToken,
    parentOrigin,
    // Resolved server-side, defaults already filled in, so the widget never has to decide what a
    // missing colour means — and an install themed before the colour picker existed keeps the
    // accent it was given.
    theme: resolveTheme(connection.theme, connection.accentColor),
    displayName: connection.displayName,
    greeting: connection.greeting,
  });

  /**
   * `frame-ancestors` lists the customer's own origins. `default-src 'none'` with a narrow
   * opt-in for what this document actually uses means a bug in the widget cannot reach anything
   * — no third-party script, no beacon, no font from someone else's CDN.
   */
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${[...connection.allowedOrigins, ...selfOrigins()].join(" ")}`,
  ].join("; ");

  return html(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Chat</title>
<link rel="stylesheet" href="/webchat/app.css">
</head>
<body>
<script id="denku-boot" type="application/json">${boot.replace(/</g, "\\u003c")}</script>
<script src="/webchat/app.js" defer></script>
</body>
</html>`,
    200,
    { "Content-Security-Policy": csp }
  );
}

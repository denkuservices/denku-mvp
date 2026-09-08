import { NextRequest, NextResponse } from "next/server";
import { getConnectionBySiteKey } from "@/lib/webchat/connections";
import { readAvatar } from "@/lib/webchat/branding";

export const dynamic = "force-dynamic";

/**
 * The widget's header picture, served from Denku's own origin.
 *
 * This route exists because of one line in the embed document's CSP: `img-src 'self' data:`. A
 * business's uploaded logo lives in a private bucket, and the honest ways to show it are a
 * per-connection CSP widening (a security header assembled from a settings field — no) or this:
 * one small same-origin endpoint that reads the object the connection points at and streams it.
 *
 * **Public on purpose, and bounded on purpose.** The address is the site key, which is already
 * printed in the customer's page source, and the thing it returns is a picture that customer
 * chose to show every visitor to their website. So there is nothing to authenticate. What it
 * must not become is a way to read the rest of the bucket — hence it never accepts a path from
 * the request. The only object it will ever return is the one the connection row names, which
 * `updateWebChatAvatarAction` proved belonged to that connection before writing it.
 *
 * A missing avatar is a 404 and not a redirect to the default: the widget already knows the
 * default and only asks here when the connection says there is a picture, so a 404 means
 * something is genuinely wrong and should look like it in a network log.
 */

const NOT_FOUND = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest, ctx: { params: Promise<{ siteKey: string }> }) {
  // Next.js 16: params is a Promise.
  const { siteKey } = await ctx.params;

  const connection = await getConnectionBySiteKey((siteKey ?? "").trim());
  if (!connection || !connection.avatarPath) return NOT_FOUND();
  if (connection.status === "disconnected") return NOT_FOUND();

  const image = await readAvatar(connection.avatarPath);
  if (!image) return NOT_FOUND();

  /**
   * Cached hard, because the URL carries the file's own id (`?v=`): a new upload is a new
   * address, so a long max-age can never show a business the logo they just replaced. Public,
   * because the bytes are public — this is the picture on their website.
   *
   * `immutable` is the honest description of a URL that changes whenever its content does.
   */
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.bytes.byteLength),
      "Cache-Control": req.nextUrl.searchParams.get("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
      // The response is an image and must be treated as one, whatever a browser would prefer to
      // guess. Belt and braces beside the byte-signature check in `branding.ts`.
      "X-Content-Type-Options": "nosniff",
      // It is embedded in an iframe on the customer's site; it is not itself a page.
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

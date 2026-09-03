import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { EMAIL_LOGO_CID } from "./brand";

/**
 * The Denku mark, as an inline attachment every branded send carries.
 *
 * **Why this exists.** `renderEmail()`'s masthead used to point at
 * `https://www.denku.io/email/denku-mark.png`. A remote image in an email is a request the
 * recipient's client decides whether to make, and most clients refuse it for a sender they have
 * not corresponded with before. The same email therefore showed the mark in the sender's own
 * Gmail and showed nothing in a customer's Hotmail — the file, the host and the HTML were all
 * fine; the customer's client simply never asked for the picture, and their first impression of
 * Denku was a masthead with a hole in it. An attachment is part of the message: there is no
 * request left to block.
 *
 * **Read once, then held.** This is a 6 KB file that never changes between deploys, and the
 * alternative is a disk read on every transactional email. The cache is per-lambda and warms on
 * the first send.
 *
 * **Never throws.** A missing file must not stop a payment receipt or a verification code going
 * out — an email with no mark is a cosmetic loss, an email that was not sent is not. On failure
 * the send simply carries no attachment, and the styled `alt` in the masthead reads "Denku".
 */

const LOGO_PATH = path.join(process.cwd(), "public", "email", "denku-mark.png");

let cached: string | null | undefined;

async function readLogoBase64(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const buf = await readFile(LOGO_PATH);
    cached = buf.toString("base64");
  } catch (err) {
    console.warn(
      "[email/inlineLogo] Could not read the brand mark; sending without it:",
      err instanceof Error ? err.message : String(err)
    );
    cached = null;
  }
  return cached;
}

/** Shape Resend expects: `contentId` turns an attachment into an inline `cid:` reference. */
export interface InlineLogoAttachment {
  filename: string;
  content: string;
  contentType: string;
  contentId: string;
}

/**
 * The attachment list for an email rendered through `renderEmail()`.
 *
 * Returns an empty array when the file cannot be read, so a caller can always spread it:
 * `attachments: await brandAttachments()`.
 *
 * Do NOT add this to a channel reply (`lib/platform/transports/email.ts`). That mail is the
 * business writing to their own customer in their own name — attaching Denku's logo to it would
 * put our brand inside someone else's correspondence.
 */
export async function brandAttachments(): Promise<InlineLogoAttachment[]> {
  const content = await readLogoBase64();
  if (!content) return [];
  return [
    {
      filename: "denku-mark.png",
      content,
      contentType: "image/png",
      contentId: EMAIL_LOGO_CID,
    },
  ];
}

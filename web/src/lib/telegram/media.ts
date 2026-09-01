import "server-only";

import { getBotToken } from "@/lib/telegram/connections";
import { fileDownloadUrl, getFile } from "@/lib/telegram/api";
import { fetchMediaBytes } from "@/lib/platform/media/store";
import { MEDIA_BYTE_LIMITS, type MediaResolver } from "@/lib/platform/media/types";

/**
 * How a Telegram attachment becomes bytes.
 *
 * This is the channel-specific half of perception, and it lives here rather than in the shared
 * media module for one reason: it needs the customer's bot token, which is a per-tenant secret
 * that `lib/telegram/connections.ts` decrypts and which must not travel any further than it has
 * to. The shared pipeline asks for a `MediaResolver` and gets a closure that already knows how to
 * authenticate — it never sees the credential.
 *
 * Two round trips per file, both Telegram's design: `getFile` exchanges the `file_id` for a
 * relative path, and the download URL built from that path carries the bot token. That URL is
 * therefore never logged and never leaves this function.
 *
 * The token is fetched once per message, not once per attachment: a customer sending three photos
 * would otherwise mean three decryptions of the same secret.
 */
export function telegramMediaResolver(connectionId: string): MediaResolver {
  let tokenPromise: Promise<string | null> | null = null;
  const token = () => (tokenPromise ??= getBotToken(connectionId));

  return async (attachment) => {
    const botToken = await token();
    if (!botToken) {
      console.error("[TELEGRAM][MEDIA][NO_TOKEN]", { connection_id: connectionId });
      return null;
    }

    const info = await getFile(botToken, attachment.ref);
    if (!info.ok || !info.result?.file_path) {
      console.warn("[TELEGRAM][MEDIA][GETFILE][FAILED]", {
        connection_id: connectionId,
        // Telegram's own description; the file id is not secret but the token is, so nothing
        // derived from the token is printed here.
        reason: info.description ?? "no_file_path",
      });
      return null;
    }

    const limit = MEDIA_BYTE_LIMITS[attachment.kind] ?? MEDIA_BYTE_LIMITS.file;
    const media = await fetchMediaBytes(fileDownloadUrl(botToken, info.result.file_path), limit);
    if (!media) return null;

    /**
     * Telegram's file endpoint answers `application/octet-stream` for a voice note, which would
     * send an OGG to a vision model. What the update said the file was is more reliable than what
     * the CDN says it is, so the adapter's mime wins whenever it has one.
     */
    return {
      ...media,
      mime: attachment.mime || media.mime,
      filename: attachment.filename ?? null,
    };
  };
}

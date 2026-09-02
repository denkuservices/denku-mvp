import "server-only";

/**
 * Turning an uploaded document into text the AI can learn from.
 *
 * Text extraction rather than handing the PDF to a vision model, for three reasons that all point
 * the same way. It works whichever provider is configured (Gemini and OpenAI disagree about how a
 * document is attached, and the OpenAI-compatible endpoint this codebase talks to Gemini through
 * does not carry PDFs at all). It is cheap enough to redo when the extraction prompt improves. And
 * the text can be stored, shown, and re-read by a person, which matters more here than anywhere
 * else in the product: what comes out of this ends up in a system prompt that a business's
 * customers hear spoken aloud.
 */

/** Hard ceiling on what we will read out of one document. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * How much extracted text is kept.
 *
 * A price list runs to a few thousand characters; a franchise operations manual runs to a million.
 * The cap is what stands between "the AI learned the business" and a prompt nobody can afford to
 * send on every turn. Truncation is announced in the stored text rather than silent, so an owner
 * reading it back can see that the document was longer than we used.
 */
export const MAX_EXTRACTED_CHARS = 60_000;

export interface ExtractedDocument {
  text: string;
  pageCount: number;
  truncated: boolean;
}

export type ExtractionFailure =
  | "unsupported_type"
  | "too_large"
  | "unreadable"
  | "no_text";

export type ExtractionResult =
  | { ok: true; document: ExtractedDocument }
  | { ok: false; reason: ExtractionFailure };

/** Types we can honestly read today. */
export function isSupportedKnowledgeType(mime: string, filename: string): boolean {
  const m = (mime ?? "").toLowerCase();
  const name = (filename ?? "").toLowerCase();
  if (m === "application/pdf" || name.endsWith(".pdf")) return true;
  if (m.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) return true;
  return false;
}

function finish(raw: string, pageCount: number): ExtractionResult {
  // Collapse the whitespace a PDF extractor leaves behind — page furniture, column gutters and
  // hyphenation produce runs of blanks that are pure prompt cost.
  const cleaned = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return { ok: false, reason: "no_text" };

  const truncated = cleaned.length > MAX_EXTRACTED_CHARS;
  const text = truncated
    ? `${cleaned.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Document continues beyond what was read.]`
    : cleaned;

  return { ok: true, document: { text, pageCount, truncated } };
}

/**
 * Read a document. Never throws — a broken upload is an answer, not an exception.
 *
 * A scanned PDF (pages of images, no text layer) comes back as `no_text` rather than as an empty
 * success, because those two look identical downstream and only one of them should tell the owner
 * to try a different file.
 */
export async function extractKnowledgeText(
  bytes: Uint8Array,
  mime: string,
  filename: string
): Promise<ExtractionResult> {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) return { ok: false, reason: "too_large" };
  if (!isSupportedKnowledgeType(mime, filename)) return { ok: false, reason: "unsupported_type" };

  const isPdf = (mime ?? "").toLowerCase() === "application/pdf" || filename.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    try {
      return finish(new TextDecoder("utf-8", { fatal: false }).decode(bytes), 1);
    } catch {
      return { ok: false, reason: "unreadable" };
    }
  }

  try {
    // Imported lazily so a route that never sees a PDF does not pay for the parser.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    return finish(Array.isArray(text) ? text.join("\n\n") : text, totalPages ?? 0);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

/** What to tell someone whose upload did not work. Plain, and never blames them for a scan. */
export function extractionFailureMessage(reason: ExtractionFailure): string {
  switch (reason) {
    case "too_large":
      return "That file is larger than 10 MB. Try the section that describes your business rather than the whole document.";
    case "unsupported_type":
      return "Upload a PDF or a text file.";
    case "no_text":
      return "We couldn't find any text in that file — it looks like a scan of a page rather than a document. A PDF exported from a document, or a text file, will work.";
    case "unreadable":
    default:
      return "We couldn't read that file. If it opens on your computer, try exporting it again as a PDF.";
  }
}

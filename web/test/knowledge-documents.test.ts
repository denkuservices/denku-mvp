import { describe, it, expect } from "vitest";
import {
  isSupportedKnowledgeType,
  extractKnowledgeText,
  extractionFailureMessage,
  MAX_EXTRACTED_CHARS,
} from "@/lib/knowledge/extract";
import { applySuggestion, unavailableSuggestion } from "@/lib/knowledge/suggest";
import { EMPTY_BUSINESS_CONTEXT } from "@/app/(app)/dashboard/_platform/team/setupFields";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("what we will try to read", () => {
  it("takes PDFs and text, by type or by extension", () => {
    expect(isSupportedKnowledgeType("application/pdf", "a.pdf")).toBe(true);
    expect(isSupportedKnowledgeType("", "prices.pdf")).toBe(true);
    expect(isSupportedKnowledgeType("text/plain", "notes.txt")).toBe(true);
    expect(isSupportedKnowledgeType("", "notes.md")).toBe(true);
  });

  it("refuses what it cannot read rather than accepting and failing later", () => {
    expect(isSupportedKnowledgeType("image/png", "menu.png")).toBe(false);
    expect(isSupportedKnowledgeType("application/vnd.ms-excel", "prices.xls")).toBe(false);
  });
});

describe("reading a document", () => {
  it("reads plain text", async () => {
    const r = await extractKnowledgeText(bytes("Açılış saatleri: 09:00-18:00"), "text/plain", "a.txt");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.document.text).toContain("09:00-18:00");
  });

  it("collapses the whitespace a document layout leaves behind", async () => {
    const r = await extractKnowledgeText(bytes("A    B\n\n\n\n\nC"), "text/plain", "a.txt");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.document.text).toBe("A B\n\nC");
  });

  it("says a file with no text is a scan, instead of succeeding emptily", async () => {
    // The two look identical downstream, and only one of them should tell the owner to try a
    // different file.
    const r = await extractKnowledgeText(bytes("   \n\n  "), "text/plain", "a.txt");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("no_text");
      expect(extractionFailureMessage(r.reason)).toContain("scan");
    }
  });

  it("announces truncation rather than silently shortening the business", async () => {
    const r = await extractKnowledgeText(bytes("x".repeat(MAX_EXTRACTED_CHARS + 500)), "text/plain", "a.txt");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.document.truncated).toBe(true);
      expect(r.document.text).toContain("Document continues");
    }
  });

  it("refuses a file over the size ceiling before trying to parse it", async () => {
    const r = await extractKnowledgeText(new Uint8Array(11 * 1024 * 1024), "application/pdf", "big.pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });
});

describe("merging a suggestion into what the owner already wrote", () => {
  it("never overwrites a field a person filled in", () => {
    // The owner's own words outrank a machine reading of a PDF, always — including when the PDF
    // is newer. Otherwise the button is dangerous to press.
    const current = { ...EMPTY_BUSINESS_CONTEXT, openingHours: "Mon-Fri 9-6", businessName: "" };
    const { merged, filled, skipped } = applySuggestion(current, {
      fields: { openingHours: "Every day 8am-11pm", businessName: "Notus Üniforma" },
      missing: [],
      source: "llm",
    });

    expect(merged.openingHours).toBe("Mon-Fri 9-6");
    expect(merged.businessName).toBe("Notus Üniforma");
    expect(filled).toEqual(["businessName"]);
    expect(skipped).toEqual(["openingHours"]);
  });

  it("ignores a blank suggestion instead of clearing a field with it", () => {
    const current = { ...EMPTY_BUSINESS_CONTEXT, services: "Uniforms" };
    const { merged, filled } = applySuggestion(current, {
      fields: { services: "   " },
      missing: [],
      source: "llm",
    });
    expect(merged.services).toBe("Uniforms");
    expect(filled).toEqual([]);
  });

  it("changes nothing when no model was reachable", () => {
    const current = { ...EMPTY_BUSINESS_CONTEXT, businessName: "Acme" };
    const { merged, filled } = applySuggestion(current, unavailableSuggestion());
    expect(merged).toEqual(current);
    expect(filled).toEqual([]);
  });

  it("reports every field as missing when nothing was read", () => {
    const s = unavailableSuggestion();
    expect(s.missing.length).toBe(Object.keys(EMPTY_BUSINESS_CONTEXT).length);
    expect(s.source).toBe("unavailable");
  });
});

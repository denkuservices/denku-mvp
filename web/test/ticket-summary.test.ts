import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/provider", () => ({
  resolveLlmProvider: vi.fn(() => null),
}));

import { resolveLlmProvider } from "@/lib/llm/provider";
import { summarizeCallForTicket, fallbackSummary, coerceSummary } from "@/lib/tickets/summarize";

const resolve = resolveLlmProvider as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resolve.mockReset();
  resolve.mockReturnValue(null);
});

describe("what a finished call should become", () => {
  it("makes no ticket out of a call where nobody said anything", async () => {
    // Not a judgement call: there is no request, so there is nothing for a person to do. The call
    // row still exists — the record is never the thing being skipped.
    const s = await summarizeCallForTicket("");
    expect(s.actionable).toBe(false);
    expect(s.priority).toBe("low");
  });

  it("keeps the ticket when it cannot judge, rather than losing the request", async () => {
    // No model configured. The platform's first rule is that a call is never dead-ended, so an
    // unreadable call resolves toward KEEPING it. An unread ticket is a smaller failure than a
    // customer request nobody ever sees.
    const s = await summarizeCallForTicket("AI: Merhaba\nUser: Siparişim gelmedi, çok kızgınım.");
    expect(s.actionable).toBe(true);
    expect(s.source).toBe("fallback");
  });

  it("titles a fallback ticket with what the caller actually said, not a category", async () => {
    const s = fallbackSummary("AI: Merhaba, size nasıl yardımcı olabilirim?\nUser: Ürün fiyatlarını öğrenmek istiyorum.");
    expect(s.subject).toContain("Ürün fiyatlarını");
    expect(s.subject).not.toBe("Support Request");
  });

  it("still produces a usable title when the caller never speaks a full line", async () => {
    const s = fallbackSummary("AI: Merhaba?");
    expect(s.subject.length).toBeGreaterThan(0);
    expect(s.actionable).toBe(true);
  });
});

describe("reading the model's answer", () => {
  it("keeps subject, summary and priority in the caller's own language", () => {
    const s = coerceSummary(
      JSON.stringify({
        actionable: true,
        subject: "Üniforma fiyat teklifi talebi",
        summary: "Arayan, 40 kişilik personel için üniforma fiyatı istedi. Geri dönüş bekliyor.",
        priority: "high",
        requester_name: "Mehmet Yılmaz",
      }),
      null
    );
    expect(s.subject).toBe("Üniforma fiyat teklifi talebi");
    expect(s.priority).toBe("high");
    expect(s.requesterName).toBe("Mehmet Yılmaz");
    expect(s.source).toBe("llm");
  });

  it("treats a summary with no subject as no answer at all", () => {
    // A ticket with a body and no title is unusable in a list, which is the only place tickets are
    // read. Half an answer falls back rather than shipping a blank row.
    const s = coerceSummary(JSON.stringify({ actionable: true, summary: "something happened" }), ["AI: hi", "User: my order is late"].join(String.fromCharCode(10)));
    expect(s.source).toBe("fallback");
    expect(s.subject).toContain("my order is late");
  });

  it("refuses a priority it does not recognise instead of storing it", () => {
    const s = coerceSummary(JSON.stringify({ subject: "x", priority: "URGENT!!" }), null);
    expect(s.priority).toBe("normal");
  });

  it("honours an explicit false, and assumes actionable when the field is missing", () => {
    expect(coerceSummary(JSON.stringify({ subject: "x", actionable: false }), null).actionable).toBe(false);
    expect(coerceSummary(JSON.stringify({ subject: "x" }), null).actionable).toBe(true);
  });

  it("never invents a caller name", () => {
    expect(coerceSummary(JSON.stringify({ subject: "x", requester_name: "" }), null).requesterName).toBeNull();
    expect(coerceSummary(JSON.stringify({ subject: "x" }), null).requesterName).toBeNull();
  });
});

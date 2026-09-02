import { describe, it, expect } from "vitest";
import { BOARD_COLUMNS, columnFor, groupIntoBoard } from "@/lib/platform/crm/board";
import type { RequestView } from "@/lib/platform/readModel/requests";

function request(id: string, status: string | null): RequestView {
  return {
    id,
    type: "ticket",
    title: "Uniform pricing",
    body: null,
    status,
    priority: null,
    occursAt: null,
    createdAt: "2026-09-01T10:00:00Z",
    callId: null,
    contactId: null,
    who: null,
    href: `/dashboard/tickets/${id}`,
  };
}

describe("which column a request belongs in", () => {
  it("puts a known status in its own column", () => {
    expect(columnFor(request("a", "open"))).toBe("open");
    expect(columnFor(request("b", "pending"))).toBe("pending");
    expect(columnFor(request("c", "closed"))).toBe("closed");
  });

  it("reads case and whitespace the way the rest of the product does", () => {
    expect(columnFor(request("a", "  OPEN "))).toBe("open");
  });

  it("treats the finished synonyms as closed", () => {
    // These already mean "done" elsewhere in the product; a board that scattered them would show
    // completed work as outstanding.
    for (const status of ["completed", "resolved", "done", "cancelled", "canceled"]) {
      expect(columnFor(request("x", status))).toBe("closed");
    }
  });

  it("never drops a request it cannot classify", () => {
    // A status from an older workflow, or one typed by hand. Somewhere arguable beats invisible:
    // the row still gets read, and a person can move it.
    for (const status of ["needs-parts", "", null]) {
      expect(columnFor(request("x", status))).toBe(BOARD_COLUMNS[0].status);
    }
  });
});

describe("the board itself", () => {
  it("always shows every column, including the empty ones", () => {
    // A board whose columns appear and vanish with the data is one you cannot drag onto: the
    // empty column you need is exactly the one that is missing.
    const groups = groupIntoBoard([request("a", "open")]);
    expect(groups.map((g) => g.status)).toEqual(BOARD_COLUMNS.map((c) => c.status));
    expect(groups.find((g) => g.status === "closed")!.items).toEqual([]);
  });

  it("keeps every request, once", () => {
    const items = [
      request("a", "open"),
      request("b", "closed"),
      request("c", "weird"),
      request("d", "pending"),
    ];
    const groups = groupIntoBoard(items);
    const placed = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(placed.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("preserves the order requests arrived in, within a column", () => {
    // The list is sorted newest-first before it gets here; the board must not quietly reorder it.
    const groups = groupIntoBoard([request("first", "open"), request("second", "open")]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["first", "second"]);
  });

  it("gives an empty column something to say", () => {
    const groups = groupIntoBoard([]);
    for (const group of groups) expect(group.emptyHint.length).toBeGreaterThan(0);
  });
});

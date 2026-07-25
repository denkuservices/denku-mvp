import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { filterConversationViews } from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";

function v(p: Partial<ConversationView>): ConversationView {
  return {
    id: "x",
    channel: "voice",
    employeeId: "e1",
    employeeName: "Front Desk AI",
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: null,
    lastActivityAt: "2026-07-20T12:00:00Z",
    summary: null,
    meta: {},
    source: "calls",
    ...p,
  };
}

const ROWS = [
  v({ id: "a", contact: { id: null, displayName: "Jane Doe", handle: "+13215551234" }, intent: "appointment", lastActivityAt: "2026-07-20T12:00:00Z", summary: "wants a cleaning" }),
  v({ id: "b", contact: { id: null, displayName: null, handle: "@acme" }, channel: "instagram", intent: "support", lastActivityAt: "2026-07-22T09:00:00Z", summary: "broken faucet" }),
  v({ id: "c", contact: { id: null, displayName: "Bob", handle: "+15550001111" }, intent: null, lastActivityAt: "2026-07-24T18:00:00Z" }),
];

describe("filterConversationViews (restores parity with legacy Calls — audit Y-001)", () => {
  it("no filters returns everything", () => {
    expect(filterConversationViews(ROWS, {})).toHaveLength(3);
  });

  it("searches across name, handle, summary and employee", () => {
    expect(filterConversationViews(ROWS, { search: "jane" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterConversationViews(ROWS, { search: "+1555" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterConversationViews(ROWS, { search: "faucet" }).map((r) => r.id)).toEqual(["b"]);
    expect(filterConversationViews(ROWS, { search: "front desk" })).toHaveLength(3);
  });

  it("search is case-insensitive and matches partials", () => {
    expect(filterConversationViews(ROWS, { search: "JANE DO" }).map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by intent (the legacy 'outcome' filter)", () => {
    expect(filterConversationViews(ROWS, { intent: "appointment" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterConversationViews(ROWS, { intent: "support" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("filters by date range, treating a bare `to` date as inclusive of the whole day", () => {
    expect(filterConversationViews(ROWS, { from: "2026-07-22" }).map((r) => r.id)).toEqual(["b", "c"]);
    expect(filterConversationViews(ROWS, { to: "2026-07-22" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterConversationViews(ROWS, { from: "2026-07-22", to: "2026-07-22" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("combines filters (AND semantics)", () => {
    expect(filterConversationViews(ROWS, { search: "faucet", intent: "appointment" })).toHaveLength(0);
    expect(filterConversationViews(ROWS, { search: "faucet", intent: "support" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("excludes rows with no activity date when a date filter is applied", () => {
    const undated = [v({ id: "z", lastActivityAt: null })];
    expect(filterConversationViews(undated, { from: "2026-01-01" })).toHaveLength(0);
    expect(filterConversationViews(undated, {})).toHaveLength(1);
  });
});

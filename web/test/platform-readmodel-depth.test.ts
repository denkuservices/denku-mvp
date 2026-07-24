import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  aggregateByChannel,
  aggregateByEmployee,
  aggregateByIntent,
  aggregateByDay,
  getConversationAggregates,
} from "@/lib/platform/readModel/aggregate";
import {
  leadRowToContactListView,
  listContactViews,
  getContactView,
  type LeadRow,
} from "@/lib/platform/readModel/contacts";
import type { ConversationView } from "@/lib/platform/readModel/types";
import { makeFakeDb, type FakeDb } from "./helpers/fakePlatformDb";

function view(partial: Partial<ConversationView>): ConversationView {
  return {
    id: "x",
    channel: "voice",
    employeeId: "emp-1",
    employeeName: "Front Desk AI",
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: null,
    lastActivityAt: null,
    summary: null,
    meta: {},
    source: "calls",
    ...partial,
  };
}

describe("aggregate — pure functions", () => {
  const views = [
    view({ channel: "voice", employeeId: "e1", employeeName: "A", intent: "appointment" }),
    view({ channel: "voice", employeeId: "e1", employeeName: "A", intent: "support" }),
    view({ channel: "instagram", employeeId: "e2", employeeName: "B", intent: null }),
  ];

  it("byChannel counts per channel", () => {
    expect(aggregateByChannel(views)).toEqual({ voice: 2, instagram: 1 });
  });
  it("byEmployee groups + sorts desc", () => {
    const e = aggregateByEmployee(views);
    expect(e[0]).toMatchObject({ employeeId: "e1", name: "A", count: 2 });
    expect(e[1]).toMatchObject({ employeeId: "e2", count: 1 });
  });
  it("byIntent maps null → unknown", () => {
    expect(aggregateByIntent(views)).toEqual({ appointment: 1, support: 1, unknown: 1 });
  });
  it("byDay zero-fills the window and buckets today", () => {
    const today = new Date().toISOString();
    const days = aggregateByDay([view({ lastActivityAt: today })], 7);
    expect(days).toHaveLength(7);
    expect(days[days.length - 1].count).toBe(1); // today is the last bucket
    expect(days.reduce((s, d) => s + d.count, 0)).toBe(1);
  });
});

describe("aggregate — assembly over fake db", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = makeFakeDb();
    db.tables.agents = [{ id: "e1", org_id: "o1", name: "A", created_at: "2026-01-01" }];
    db.tables.calls = [
      { id: "c1", org_id: "o1", agent_id: "e1", from_phone: "+1", transcript: "AI: hi", intent: "appointment", started_at: "2026-07-24T10:00:00Z", ended_at: "2026-07-24T10:01:00Z", created_at: "2026-07-24T10:00:00Z" },
    ];
    db.tables.conversations = [];
  });
  it("assembles aggregates and flags limited honestly", async () => {
    const agg = await getConversationAggregates("o1", { limit: 500, windowDays: 7 }, db as any);
    expect(agg.total).toBe(1);
    expect(agg.byChannel.voice).toBe(1);
    expect(agg.limited).toBe(false);
    const small = await getConversationAggregates("o1", { limit: 1 }, db as any);
    expect(small.limited).toBe(true); // hit the bound → "recent", not all-time
  });
});

describe("contacts read model", () => {
  const lead: LeadRow = {
    id: "lead-1",
    name: "Jane Doe",
    phone: "+13215551234",
    email: "jane@example.com",
    source: "inbound_call",
    status: "new",
    notes: "called about booking",
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-24T00:00:00Z",
  };

  it("leadRowToContactListView maps + infers channel from source; id = lead id", () => {
    const c = leadRowToContactListView(lead);
    expect(c.id).toBe("lead-1");
    expect(c.displayName).toBe("Jane Doe");
    expect(c.primaryHandle).toBe("+13215551234");
    expect(c.channels).toEqual(["voice"]);
  });

  it("listContactViews reads leads, org-scoped", async () => {
    const db = makeFakeDb();
    db.tables.leads = [{ ...lead, org_id: "o1" }];
    const list = await listContactViews("o1", {}, db as any);
    expect(list).toHaveLength(1);
    expect(list[0].displayName).toBe("Jane Doe");
  });

  it("getContactView attaches conversation history (matched by contact id/handle)", async () => {
    const db = makeFakeDb();
    db.tables.leads = [{ ...lead, org_id: "o1" }];
    db.tables.agents = [{ id: "e1", org_id: "o1", name: "A", created_at: "2026-01-01" }];
    db.tables.calls = [
      { id: "call-1", org_id: "o1", agent_id: "e1", from_phone: "+13215551234", lead_id: "lead-1", transcript: "AI: hi User: book", started_at: "2026-07-24T10:00:00Z", ended_at: "2026-07-24T10:01:00Z", created_at: "2026-07-24T10:00:00Z" },
    ];
    db.tables.conversations = [];
    const detail = await getContactView("o1", "lead-1", db as any);
    expect(detail).toBeTruthy();
    expect(detail!.identities).toContainEqual({ channel: "voice", value: "+13215551234" });
    expect(detail!.identities).toContainEqual({ channel: "email", value: "jane@example.com" });
    expect(detail!.conversations.length).toBe(1);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  callRowToConversationView,
  conversationRowToConversationView,
  sortByActivityDesc,
  listConversationViews,
  getConversationView,
  type CallRow,
} from "@/lib/platform/readModel/conversations";
import {
  CONNECTION_SOURCES,
  rowToChannelView,
  comingSoonChannelViews,
  listChannelViews,
} from "@/lib/platform/readModel/channels";
import { agentRowToEmployeeView, listEmployeeViews } from "@/lib/platform/readModel/employees";
import { comingSoonChannels } from "@/lib/platform/channels";
import { makeFakeDb, type FakeDb } from "./helpers/fakePlatformDb";

const CALL: CallRow = {
  id: "call-1",
  agent_id: "emp-1",
  from_phone: "+13215551234",
  lead_id: "lead-9",
  intent: "appointment",
  outcome: "handled",
  completion_state: "completed",
  transcript: "AI: Hello, Denku here User: I'd like to book Tuesday",
  duration_seconds: 84,
  direction: "inbound",
  started_at: "2026-07-24T10:00:00Z",
  ended_at: "2026-07-24T10:02:00Z",
  created_at: "2026-07-24T10:00:00Z",
};

describe("read model — pure mappers", () => {
  it("callRowToConversationView maps voice into a ConversationView", () => {
    const v = callRowToConversationView(CALL, "Front Desk AI");
    expect(v.channel).toBe("voice");
    expect(v.employeeId).toBe("emp-1");
    expect(v.employeeName).toBe("Front Desk AI");
    expect(v.contact.handle).toBe("+13215551234");
    expect(v.intent).toBe("appointment");
    expect(v.lastActivityAt).toBe("2026-07-24T10:02:00Z");
    expect(v.meta.durationSeconds).toBe(84);
    expect(v.source).toBe("calls");
    expect(v.summary).toContain("Denku");
  });

  it("conversationRowToConversationView maps chat into a ConversationView", () => {
    const v = conversationRowToConversationView(
      { id: "c1", channel: "instagram", agent_id: "emp-1", contact_id: "ct1", external_user_id: "iguser", status: "open", last_message_at: "2026-07-24T11:00:00Z", created_at: "2026-07-24T09:00:00Z" },
      "Front Desk AI"
    );
    expect(v.channel).toBe("instagram");
    expect(v.contact.handle).toBe("iguser");
    expect(v.lastActivityAt).toBe("2026-07-24T11:00:00Z");
    expect(v.source).toBe("conversations");
  });

  it("sortByActivityDesc orders newest-first, nulls last", () => {
    const a = { lastActivityAt: "2026-07-24T10:00:00Z" } as any;
    const b = { lastActivityAt: "2026-07-24T12:00:00Z" } as any;
    const c = { lastActivityAt: null } as any;
    expect([a, b, c].sort(sortByActivityDesc).map((x) => x.lastActivityAt)).toEqual([
      "2026-07-24T12:00:00Z",
      "2026-07-24T10:00:00Z",
      null,
    ]);
  });

  it("phoneLine + instagram map to ChannelViews; coming-soon derives from registry", () => {
    const v = rowToChannelView("voice", CONNECTION_SOURCES.voice!, { id: "pl1", phone_number_e164: "+1321", status: "live", line_type: "support", assigned_agent_id: "emp-1", vapi_phone_number_id: "vp1" });
    expect(v.channel).toBe("voice");
    expect(v.status).toBe("connected");
    expect(v.identifier).toBe("+1321");

    const ig = rowToChannelView("instagram", CONNECTION_SOURCES.instagram!, { id: "ig1", username: "denku", ig_user_id: "123", status: "connected" });
    expect(ig.channel).toBe("instagram");
    expect(ig.identifier).toBe("denku");

    const soon = comingSoonChannelViews();
    expect(soon.map((c) => c.channel)).toEqual(comingSoonChannels());
    expect(soon.every((c) => c.status === "coming_soon")).toBe(true);
  });

  it("agentRowToEmployeeView — Employee owns its channels; status reflects connection", () => {
    const withChannel = agentRowToEmployeeView(
      { id: "emp-1", name: "Front Desk AI", language: "en", voice: "alloy", vapi_assistant_id: "va1", vapi_sync_status: "ok" },
      [rowToChannelView("voice", CONNECTION_SOURCES.voice!, { id: "pl1", phone_number_e164: "+1", status: "live", line_type: "support", assigned_agent_id: "emp-1", vapi_phone_number_id: "vp1" })]
    );
    expect(withChannel.channels).toHaveLength(1);
    expect(withChannel.status).toBe("active");

    const noChannel = agentRowToEmployeeView(
      { id: "emp-2", name: "New AI", language: "en", voice: "alloy", vapi_assistant_id: null, vapi_sync_status: null },
      []
    );
    expect(noChannel.status).toBe("inactive");
  });
});

describe("read model — assembly over fake db", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = makeFakeDb();
    db.tables.agents = [{ id: "emp-1", org_id: "o1", name: "Front Desk AI", language: "en", voice: "alloy", vapi_assistant_id: "va1", vapi_sync_status: "ok", created_at: "2026-01-01" }];
    db.tables.calls = [{ ...CALL, org_id: "o1" }];
    db.tables.conversations = [{ id: "c1", org_id: "o1", channel: "instagram", agent_id: "emp-1", contact_id: "ct1", external_user_id: "iguser", status: "open", last_message_at: "2026-07-24T11:00:00Z", created_at: "2026-07-24T09:00:00Z" }];
    db.tables.messages = [{ id: "m1", org_id: "o1", conversation_id: "c1", role: "user", content: "hi", direction: "inbound", created_at: "2026-07-24T09:00:00Z" }];
    db.tables.phone_lines = [{ id: "pl1", org_id: "o1", phone_number_e164: "+1321", status: "live", line_type: "support", assigned_agent_id: "emp-1", vapi_phone_number_id: "vp1" }];
    db.tables.instagram_connections = [{ id: "ig1", org_id: "o1", username: "denku", ig_user_id: "123", status: "connected" }];
    db.tables.tickets = [{ id: "t1", org_id: "o1", call_id: "call-1", subject: "Follow up", status: "open" }];
    db.tables.appointments = [];
  });

  it("listConversationViews merges voice (calls) + IG (conversations), newest first", async () => {
    const list = await listConversationViews("o1", {}, db as any);
    expect(list.map((c) => c.channel)).toEqual(["instagram", "voice"]); // IG 11:00 > voice 10:02
    expect(list).toHaveLength(2);
  });

  it("listConversationViews channel=voice returns only voice", async () => {
    const list = await listConversationViews("o1", { channel: "voice" }, db as any);
    expect(list).toHaveLength(1);
    expect(list[0].channel).toBe("voice");
  });

  it("getConversationView builds voice detail with turns + artifacts", async () => {
    const detail = await getConversationView("o1", "call-1", db as any);
    expect(detail).toBeTruthy();
    expect(detail!.channel).toBe("voice");
    expect(detail!.turns.length).toBeGreaterThanOrEqual(2);
    expect(detail!.turns[0].channel).toBe("voice");
    expect(detail!.artifacts).toEqual([{ id: "t1", type: "ticket", status: "open", title: "Follow up" }]);
  });

  it("getConversationView builds chat detail from messages", async () => {
    const detail = await getConversationView("o1", "c1", db as any);
    expect(detail!.channel).toBe("instagram");
    expect(detail!.turns).toHaveLength(1);
    expect(detail!.turns[0].content).toBe("hi");
  });

  it("listEmployeeViews — employee owns the voice channel assigned to it", async () => {
    const emps = await listEmployeeViews("o1", db as any);
    expect(emps).toHaveLength(1);
    expect(emps[0].id).toBe("emp-1");
    expect(emps[0].channels).toHaveLength(1);
    expect(emps[0].channels[0].channel).toBe("voice");
    expect(emps[0].status).toBe("active");
  });

  it("listChannelViews — org inventory: connected channels + coming-soon", async () => {
    const chans = await listChannelViews("o1", db as any);
    const connected = chans.filter((c) => c.status === "connected");
    const soon = chans.filter((c) => c.status === "coming_soon");
    expect(connected.map((c) => c.channel).sort()).toEqual(["instagram", "voice"]);
    expect(soon.map((c) => c.channel).sort()).toEqual([...comingSoonChannels()].sort());
  });
});

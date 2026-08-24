import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  summarizeEmployeeActivity,
  employeeAttention,
  ACTIVITY_WINDOW_DAYS,
} from "@/lib/platform/readModel/employeeActivity";
import { flattenBusinessContext } from "@/lib/platform/readModel/employeeProfile";
import { EMPLOYEE_TABS, resolveEmployeeTab, isEmployeeTab, EMPLOYEE_TAB_META } from "@/app/(app)/dashboard/_platform/team/tabs";
import type { ConversationView, EmployeeView, ChannelView } from "@/lib/platform/readModel/types";

function conversation(id: string, employeeId: string | null, at: string): ConversationView {
  return {
    id,
    channel: "voice",
    employeeId,
    employeeName: null,
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: at,
    lastActivityAt: at,
    summary: null,
    meta: {},
    source: "calls",
  };
}

function channel(over: Partial<ChannelView> = {}): ChannelView {
  return {
    channel: "voice",
    label: "Phone",
    kind: "voice",
    productionReady: true,
    status: "connected",
    connectionId: "conn-1",
    identifier: "+13215550100",
    meta: {},
    ...over,
  };
}

function employee(over: Partial<EmployeeView> = {}): EmployeeView {
  return {
    id: "emp-1",
    name: "Main Line",
    language: "en",
    voice: null,
    status: "active",
    channels: [channel()],
    vapiAssistantId: null,
    ...over,
  };
}

/**
 * ACTIVITY CONTRACT (Phase 5).
 *
 * The roster's job is to report what an employee accomplished. Every number must be observed,
 * and a bounded scan must never be presented as an all-time total — that is the fabricated-count
 * failure Sprint 8.5 caught before it shipped.
 */
describe("summarizeEmployeeActivity", () => {
  const at = "2026-08-20T10:00:00.000Z";

  it("counts only this employee's conversations", () => {
    const out = summarizeEmployeeActivity(
      "emp-1",
      [conversation("c1", "emp-1", at), conversation("c2", "emp-2", at), conversation("c3", null, at)],
      new Set()
    );
    expect(out.conversationsHandled).toBe(1);
  });

  it("attributes a request to the conversation that produced it", () => {
    const out = summarizeEmployeeActivity(
      "emp-1",
      [conversation("c1", "emp-1", at), conversation("c2", "emp-1", at)],
      new Set(["c1"])
    );
    expect(out.requestsProduced).toBe(1);
  });

  it("reports the most recent activity, not the first", () => {
    const out = summarizeEmployeeActivity(
      "emp-1",
      [
        conversation("c1", "emp-1", "2026-08-01T10:00:00.000Z"),
        conversation("c2", "emp-1", "2026-08-15T10:00:00.000Z"),
      ],
      new Set()
    );
    expect(out.lastActiveAt).toBe("2026-08-15T10:00:00.000Z");
  });

  it("carries the window and bounded flag so the UI can say '12+ in 7 days'", () => {
    const out = summarizeEmployeeActivity("emp-1", [], new Set(), { bounded: true });
    expect(out.windowDays).toBe(ACTIVITY_WINDOW_DAYS);
    expect(out.bounded).toBe(true);
  });

  it("returns zeros — not nulls — for an employee that has done nothing", () => {
    const out = summarizeEmployeeActivity("emp-1", [], new Set());
    expect(out.conversationsHandled).toBe(0);
    expect(out.requestsProduced).toBe(0);
    expect(out.lastActiveAt).toBeNull();
  });
});

/**
 * ATTENTION CONTRACT.
 *
 * Attention must be derived from something observable and must stay silent when nothing is
 * wrong — a dashboard that manufactures warnings to fill space trains people to ignore it.
 */
describe("employeeAttention", () => {
  it("is silent when every channel is healthy", () => {
    expect(employeeAttention(employee())).toBeNull();
  });

  it("flags an employee with no channel — it cannot reach anyone", () => {
    const out = employeeAttention(employee({ channels: [] }));
    expect(out?.severity).toBe("warn");
    expect(out?.message).toMatch(/no way to reach/i);
  });

  it("surfaces a provider error as critical", () => {
    const out = employeeAttention(
      employee({ channels: [channel({ meta: { lastError: "Token revoked by Meta" } })] })
    );
    expect(out?.severity).toBe("critical");
    expect(out?.message).toContain("Token revoked by Meta");
  });

  it("escalates: one critical channel outranks a merely warning one", () => {
    const out = employeeAttention(
      employee({
        channels: [
          // `ChannelStatus` is a union in TypeScript, but the value originates from a free-text
          // DB column — a status outside the union is reachable at runtime, and health treats
          // an unrecognised one as `warn` rather than assuming it is healthy. Cast to exercise
          // that real path.
          channel({ label: "Phone", status: "weird-status" as ChannelView["status"] }),
          channel({ label: "Instagram", channel: "instagram", meta: { lastError: "Expired" } }), // critical
        ],
      })
    );
    expect(out?.severity).toBe("critical");
    expect(out?.message).toContain("Instagram");
  });

  it("never alerts on a coming-soon channel — unbuilt is not broken", () => {
    const out = employeeAttention(
      employee({ channels: [channel({ status: "coming_soon", productionReady: false })] })
    );
    expect(out).toBeNull();
  });
});

describe("flattenBusinessContext", () => {
  it("renders readable scalars and humanises the key", () => {
    expect(flattenBusinessContext({ opening_hours: "9-5" })).toEqual([
      { key: "opening_hours", label: "Opening hours", value: "9-5" },
    ]);
  });

  it("joins string arrays rather than dropping them", () => {
    expect(flattenBusinessContext({ services: ["Plumbing", "Heating"] })[0].value).toBe("Plumbing, Heating");
  });

  it("omits nested objects instead of rendering [object Object]", () => {
    expect(flattenBusinessContext({ nested: { a: 1 }, ok: "yes" }).map((f) => f.key)).toEqual(["ok"]);
  });

  it("omits blank and null values", () => {
    expect(flattenBusinessContext({ a: "", b: "   ", c: null, d: undefined })).toEqual([]);
  });

  it("tolerates a non-object payload without throwing", () => {
    expect(flattenBusinessContext(null)).toEqual([]);
    expect(flattenBusinessContext("nope")).toEqual([]);
    expect(flattenBusinessContext([1, 2])).toEqual([]);
  });
});

/**
 * TAB CONTRACT — the six approved sections, each explained.
 */
describe("employee detail tabs", () => {
  it("is exactly the approved six, in order", () => {
    expect([...EMPLOYEE_TABS]).toEqual([
      "overview",
      "setup",
      "knowledge",
      "channels",
      "activity",
      "history",
    ]);
  });

  it("falls back to Overview on an unknown tab instead of 404-ing", () => {
    expect(resolveEmployeeTab("nonsense")).toBe("overview");
    expect(resolveEmployeeTab(undefined)).toBe("overview");
    expect(resolveEmployeeTab("history")).toBe("history");
  });

  it("validates tab names", () => {
    expect(isEmployeeTab("setup")).toBe(true);
    expect(isEmployeeTab("billing")).toBe(false);
  });

  it("every tab has a real description — no section is left unexplained", () => {
    for (const tab of EMPLOYEE_TABS) {
      expect(EMPLOYEE_TAB_META[tab].description.length).toBeGreaterThan(10);
    }
  });
});

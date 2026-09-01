import { describe, it, expect, vi } from "vitest";

// The timeline module imports the fail-fast service-role client transitively.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { buildTimeline } from "@/lib/platform/readModel/timeline";
import { listRequestViews } from "@/lib/platform/readModel/requests";
import { listConversationViews } from "@/lib/platform/readModel/conversations";
import { validateNoteBody, NOTE_MAX_LENGTH } from "@/lib/platform/noteRules";
import { LIFECYCLE_STAGES, isLifecycleStage, lifecycleMeta } from "@/lib/platform/lifecycle";
import type { ConversationView } from "@/lib/platform/readModel/types";
import type { RequestView } from "@/lib/platform/readModel/requests";
import type { ContactNote } from "@/lib/platform/contactNotes";

function conversation(id: string, at: string | null, over: Partial<ConversationView> = {}): ConversationView {
  return {
    id,
    channel: "voice",
    employeeId: null,
    employeeName: null,
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: at,
    lastActivityAt: at,
    summary: null,
    meta: {},
    source: "calls",
    ...over,
  };
}

function request(id: string, createdAt: string, over: Partial<RequestView> = {}): RequestView {
  return {
    id,
    type: "ticket",
    title: "Broken boiler",
    body: null,
    status: "open",
    priority: null,
    occursAt: null,
    createdAt,
    callId: null,
    contactId: null,
    who: null,
    href: `/dashboard/tickets/${id}`,
    ...over,
  };
}

function note(id: string, createdAt: string, body = "Prefers mornings"): ContactNote {
  return { id, body, authorId: null, createdAt };
}

/**
 * TIMELINE CONTRACT (Phase 4).
 *
 * The timeline is the CRM's central claim — that a scattered history reads as one customer
 * journey. Two properties make it trustworthy: it is strictly ordered, and it never invents an
 * entry. Both are pinned here.
 */
describe("buildTimeline", () => {
  it("merges every source into one reverse-chronological stream", () => {
    const entries = buildTimeline({
      conversations: [conversation("c1", "2026-08-01T10:00:00.000Z")],
      requests: [request("r1", "2026-08-03T10:00:00.000Z")],
      notes: [note("n1", "2026-08-02T10:00:00.000Z")],
    });

    expect(entries.map((e) => e.kind)).toEqual(["request", "note", "conversation"]);
    expect(entries.map((e) => e.at)).toEqual([
      "2026-08-03T10:00:00.000Z",
      "2026-08-02T10:00:00.000Z",
      "2026-08-01T10:00:00.000Z",
    ]);
  });

  it("drops entries with no usable timestamp instead of guessing a position", () => {
    // A timeline whose order is partly invented is worse than one that is short.
    const entries = buildTimeline({
      conversations: [conversation("c1", null)],
      requests: [],
      notes: [],
    });
    expect(entries).toEqual([]);
  });

  it("falls back to startedAt when a conversation has no last activity", () => {
    const entries = buildTimeline({
      conversations: [conversation("c1", null, { startedAt: "2026-08-01T09:00:00.000Z" })],
      requests: [],
      notes: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].at).toBe("2026-08-01T09:00:00.000Z");
  });

  it("orders equal timestamps deterministically (no reshuffling between renders)", () => {
    const at = "2026-08-01T10:00:00.000Z";
    const first = buildTimeline({ conversations: [conversation("c1", at)], requests: [request("r1", at)], notes: [note("n1", at)] });
    const second = buildTimeline({ notes: [note("n1", at)], requests: [request("r1", at)], conversations: [conversation("c1", at)] });
    expect(first.map((e) => e.key)).toEqual(second.map((e) => e.key));
  });

  it("keys are unique so a call id and a ticket id can never collide", () => {
    const entries = buildTimeline({
      conversations: [conversation("shared-id", "2026-08-01T10:00:00.000Z")],
      requests: [request("shared-id", "2026-08-02T10:00:00.000Z")],
      notes: [note("shared-id", "2026-08-03T10:00:00.000Z")],
    });
    expect(new Set(entries.map((e) => e.key)).size).toBe(3);
  });

  it("links conversations into the Inbox and requests to their existing detail page", () => {
    const entries = buildTimeline({
      conversations: [conversation("c1", "2026-08-01T10:00:00.000Z")],
      requests: [request("r1", "2026-08-02T10:00:00.000Z")],
      notes: [note("n1", "2026-08-03T10:00:00.000Z")],
    });
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e]));
    expect(byKind.conversation.href).toBe("/dashboard/inbox/c1");
    expect(byKind.request.href).toBe("/dashboard/tickets/r1");
    // Notes have no destination — they are read in place.
    expect(byKind.note.href).toBeNull();
  });

  it("carries the channel on conversations only, so badges never appear on notes", () => {
    const entries = buildTimeline({
      conversations: [conversation("c1", "2026-08-01T10:00:00.000Z", { channel: "instagram" })],
      requests: [request("r1", "2026-08-02T10:00:00.000Z")],
      notes: [note("n1", "2026-08-03T10:00:00.000Z")],
    });
    const byKind = Object.fromEntries(entries.map((e) => [e.kind, e]));
    expect(byKind.conversation.channel).toBe("instagram");
    expect(byKind.request.channel).toBeNull();
    expect(byKind.note.channel).toBeNull();
  });

  it("is empty for a contact with no history rather than fabricating a 'created' entry", () => {
    expect(buildTimeline({ conversations: [], requests: [], notes: [] })).toEqual([]);
  });
});

describe("validateNoteBody", () => {
  it("rejects blank notes the way the DB CHECK does", () => {
    expect(validateNoteBody("").ok).toBe(false);
    expect(validateNoteBody("   \n ").ok).toBe(false);
  });

  it("trims before storing", () => {
    const res = validateNoteBody("  hello  ");
    expect(res).toEqual({ ok: true, body: "hello" });
  });

  it("enforces the length cap", () => {
    expect(validateNoteBody("x".repeat(NOTE_MAX_LENGTH)).ok).toBe(true);
    expect(validateNoteBody("x".repeat(NOTE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

/**
 * LIFECYCLE CONTRACT.
 *
 * The lifecycle reuses `leads.status`, whose vocabulary is enforced by zod in the lead create
 * action. These tests keep the two definitions from drifting, and pin the rule that a legacy
 * value is displayed rather than silently relabelled.
 */
describe("lifecycle", () => {
  it("matches the vocabulary the lead create action enforces", () => {
    expect([...LIFECYCLE_STAGES]).toEqual(["new", "contacted", "qualified", "unqualified"]);
  });

  it("accepts only known stages", () => {
    expect(isLifecycleStage("qualified")).toBe(true);
    expect(isLifecycleStage("customer")).toBe(false);
    expect(isLifecycleStage(null)).toBe(false);
  });

  it("every stage has a real description — the UI never invents copy", () => {
    for (const stage of LIFECYCLE_STAGES) {
      expect(lifecycleMeta(stage)!.description.length).toBeGreaterThan(10);
    }
  });

  it("shows a legacy value as-is instead of coercing it to 'new'", () => {
    const meta = lifecycleMeta("converted");
    expect(meta).not.toBeNull();
    expect(meta!.label).toBe("Converted");
    expect(meta!.value).toBe("converted");
  });

  it("returns null for no status, so the UI can prompt instead of asserting a stage", () => {
    expect(lifecycleMeta(null)).toBeNull();
    expect(lifecycleMeta("")).toBeNull();
  });
});

/**
 * PUSH-DOWN CONTRACT (H1 fix).
 *
 * The contact timeline is the CRM's central claim: the complete customer journey. It used to be
 * built by scanning the org's most recent 200 requests/conversations and filtering to this
 * person afterwards — so once an org passed 200, a customer's older history silently vanished
 * from the one surface that promises completeness. The contact filter now reaches the database.
 */
describe("contact scoping is pushed into the query", () => {
  /** Records the column filters each query received. */
  function trackingDb() {
    const queries: Array<{ table: string; eq: Array<[string, unknown]> }> = [];
    const db = {
      from(table: string) {
        const rec = { table, eq: [] as Array<[string, unknown]> };
        queries.push(rec);
        const b = {
          select: () => b,
          eq: (col: string, val: unknown) => {
            rec.eq.push([col, val]);
            return b;
          },
          in: () => b,
          order: () => b,
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return b;
      },
    };
    return { db: db as never, queries };
  }

  it("filters requests by lead_id at the database, not afterwards", async () => {
    const { db, queries } = trackingDb();
    await listRequestViews("org-1", { contactId: "lead-9" }, db);

    for (const table of ["tickets", "appointments"]) {
      const q = queries.find((x) => x.table === table);
      expect(q, `${table} was not queried`).toBeDefined();
      expect(q!.eq).toContainEqual(["org_id", "org-1"]);
      expect(q!.eq, `${table} did not push down the contact filter`).toContainEqual(["lead_id", "lead-9"]);
    }
  });

  it("filters conversations by the contact column of each source", async () => {
    const { db, queries } = trackingDb();
    await listConversationViews("org-1", { contactId: "lead-9" }, db);

    // Voice lives in `calls` (lead_id); chat lives in `conversations` (contact_id).
    const callsQuery = queries.find((x) => x.table === "calls");
    expect(callsQuery!.eq).toContainEqual(["lead_id", "lead-9"]);

    const convQuery = queries.find((x) => x.table === "conversations");
    expect(convQuery!.eq).toContainEqual(["contact_id", "lead-9"]);
  });

  it("still scopes every contact-filtered query to the org", async () => {
    // The service-role client has no RLS net: a contact filter must never replace org scoping.
    const { db, queries } = trackingDb();
    await listConversationViews("org-1", { contactId: "lead-9" }, db);
    for (const q of queries) {
      expect(q.eq, `${q.table} lost its org filter`).toContainEqual(["org_id", "org-1"]);
    }
  });

  it("does not push down a contact filter when none was asked for", async () => {
    const { db, queries } = trackingDb();
    await listRequestViews("org-1", {}, db);
    for (const q of queries) {
      expect(q.eq.some(([col]) => col === "lead_id")).toBe(false);
    }
  });
});

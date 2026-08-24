import { describe, it, expect, vi } from "vitest";

// filterConversationViews is pure, but its module imports the fail-fast service-role client.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { filterConversationViews } from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";

/**
 * HANDLING FILTER CONTRACT (Phase 3).
 *
 * Human takeover is channel-agnostic: voice conversations come from `calls` and chat from
 * `conversations`, so handling state cannot be joined in the query and is applied as a pure
 * in-memory filter over the already-scanned window. That is what preserves the Inbox's truthful
 * count (`total` keeps describing the same window, `bounded` keeps meaning the same thing).
 *
 * The load-bearing default: a conversation with NO recorded state is AI-handled. Getting that
 * backwards would show every untouched conversation as needing a person.
 */

function view(id: string, over: Partial<ConversationView> = {}): ConversationView {
  return {
    id,
    channel: "voice",
    employeeId: null,
    employeeName: null,
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: "2026-08-20T10:00:00.000Z",
    lastActivityAt: "2026-08-20T10:00:00.000Z",
    summary: null,
    meta: {},
    source: "calls",
    ...over,
  };
}

const views = [view("a"), view("b"), view("c", { channel: "instagram", source: "conversations" })];

describe("filterConversationViews — handling facet", () => {
  it("returns everything when no handling filter is applied", () => {
    expect(filterConversationViews(views, {}).map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("'human' keeps only conversations in the human-owned set", () => {
    const out = filterConversationViews(views, {
      handling: "human",
      humanHandledRefs: new Set(["b"]),
    });
    expect(out.map((v) => v.id)).toEqual(["b"]);
  });

  it("'ai' keeps everything NOT in the set — no state means AI-handled", () => {
    const out = filterConversationViews(views, {
      handling: "ai",
      humanHandledRefs: new Set(["b"]),
    });
    expect(out.map((v) => v.id)).toEqual(["a", "c"]);
  });

  it("works across channels — takeover is not an Instagram feature", () => {
    const out = filterConversationViews(views, {
      handling: "human",
      humanHandledRefs: new Set(["c"]),
    });
    expect(out.map((v) => v.id)).toEqual(["c"]);
    expect(out[0].channel).toBe("instagram");
  });

  it("treats a missing ref set as 'nothing is human-handled' rather than throwing", () => {
    // This is the migration-not-applied path: listHumanHandledRefs fails soft to an empty set.
    expect(filterConversationViews(views, { handling: "human" })).toEqual([]);
    expect(filterConversationViews(views, { handling: "ai" }).map((v) => v.id)).toEqual(["a", "b", "c"]);
  });

  it("composes with the other filters instead of replacing them", () => {
    const mixed = [
      view("a", { intent: "appointment" }),
      view("b", { intent: "support" }),
      view("c", { intent: "appointment" }),
    ];
    const out = filterConversationViews(mixed, {
      intent: "appointment",
      handling: "human",
      humanHandledRefs: new Set(["a", "b"]),
    });
    expect(out.map((v) => v.id)).toEqual(["a"]);
  });

  it("still applies search alongside handling", () => {
    const named = [
      view("a", { contact: { id: null, displayName: "Ada Lovelace", handle: null } }),
      view("b", { contact: { id: null, displayName: "Grace Hopper", handle: null } }),
    ];
    const out = filterConversationViews(named, {
      search: "grace",
      handling: "human",
      humanHandledRefs: new Set(["a", "b"]),
    });
    expect(out.map((v) => v.id)).toEqual(["b"]);
  });
});

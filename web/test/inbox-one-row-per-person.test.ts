import { describe, it, expect, vi } from "vitest";

// The module reaches for the service-role client at import time; these tests exercise a pure
// function and never touch it.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { collapseByContact } from "@/lib/platform/readModel/conversations";
import type { ConversationView } from "@/lib/platform/readModel/types";
import type { Channel } from "@/lib/platform/channels";

/**
 * The Inbox is a messaging surface, so it shows one row per person per channel.
 *
 * A voice row comes from `calls`, which holds one row per CALL — the billing record, the
 * transcript, the artifact's parent. Rendered straight, a customer who rang eighteen times
 * appeared eighteen times: the same unusable list the Customers page had before its duplicates
 * were merged, and for the same reason — the owner cannot tell a returning customer from a new
 * one.
 *
 * The data is untouched; only the view collapses. These tests pin the three rules, and the
 * second one is the one the owner asked for explicitly.
 */

function view(over: Partial<ConversationView> & { id: string }): ConversationView {
  return {
    id: over.id,
    channel: (over.channel ?? "voice") as Channel,
    employeeId: null,
    employeeName: null,
    contact: over.contact ?? { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: null,
    lastActivityAt: over.lastActivityAt ?? "2026-09-07T12:00:00Z",
    summary: over.summary ?? null,
    meta: over.meta ?? {},
    source: over.source ?? "calls",
  };
}

describe("collapseByContact", () => {
  it("merges every call from one number into a single row", () => {
    const rows = collapseByContact([
      view({ id: "c3", contact: { id: "lead-1", displayName: null, handle: "+905425615772" }, lastActivityAt: "2026-09-07T12:00:00Z" }),
      view({ id: "c2", contact: { id: "lead-1", displayName: null, handle: "+905425615772" }, lastActivityAt: "2026-09-06T12:00:00Z" }),
      view({ id: "c1", contact: { id: "lead-1", displayName: null, handle: "+905425615772" }, lastActivityAt: "2026-09-05T12:00:00Z" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("c3"); // the newest represents the group
    expect(rows[0].meta.mergedCount).toBe(3);
    expect(rows[0].meta.mergedIds).toEqual(["c3", "c2", "c1"]);
  });

  /** The rule the owner stated: same person, different channel, different row. */
  it("keeps the same person on two channels as two rows", () => {
    const contact = { id: "lead-1", displayName: null, handle: "+905425615772" };
    const rows = collapseByContact([
      view({ id: "call-1", channel: "voice", contact }),
      view({ id: "conv-1", channel: "telegram", contact, source: "conversations" }),
      view({ id: "call-2", channel: "voice", contact }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.channel).sort()).toEqual(["telegram", "voice"]);
    expect(rows.find((r) => r.channel === "voice")!.meta.mergedCount).toBe(2);
    expect(rows.find((r) => r.channel === "telegram")!.meta.mergedCount).toBe(1);
  });

  it("never merges anonymous callers into an invented customer", () => {
    // No contact id and no caller ID. Two of these are two strangers, not one repeat customer.
    const rows = collapseByContact([
      view({ id: "a1", contact: { id: null, displayName: null, handle: null } }),
      view({ id: "a2", contact: { id: null, displayName: null, handle: null } }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.meta.mergedCount === 1)).toBe(true);
  });

  it("falls back to the handle when there is no contact row yet", () => {
    const rows = collapseByContact([
      view({ id: "c2", contact: { id: null, displayName: null, handle: "+905425615772" } }),
      view({ id: "c1", contact: { id: null, displayName: null, handle: "+905425615772" } }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].meta.mergedCount).toBe(2);
  });

  it("does not treat two different numbers as the same person", () => {
    const rows = collapseByContact([
      view({ id: "c1", contact: { id: null, displayName: null, handle: "+905425615772" } }),
      view({ id: "c2", contact: { id: null, displayName: null, handle: "+905542265187" } }),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("carries every member id, so a star on an older call is still findable", () => {
    // listInboxPage looks star/unread state up across mergedIds — without them, flagging a
    // conversation and then being rung again would silently drop the flag.
    const rows = collapseByContact([
      view({ id: "new", contact: { id: "lead-1", displayName: null, handle: "+9" } }),
      view({ id: "old-and-starred", contact: { id: "lead-1", displayName: null, handle: "+9" } }),
    ]);

    expect(rows[0].meta.mergedIds).toContain("old-and-starred");
  });

  it("preserves the representative's own channel meta", () => {
    const rows = collapseByContact([
      view({ id: "c1", contact: { id: "lead-1", displayName: null, handle: "+9" }, meta: { durationSeconds: 42 } }),
    ]);
    expect(rows[0].meta.durationSeconds).toBe(42);
    expect(rows[0].meta.mergedCount).toBe(1);
  });

  it("is a no-op on an empty list", () => {
    expect(collapseByContact([])).toEqual([]);
  });
});

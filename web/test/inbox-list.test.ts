import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The read model's module graph reaches the fail-fast service-role client.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { listInboxPage } from "@/lib/platform/readModel/inbox";
import { isUnread, UNREAD_TRACKING_SINCE } from "@/lib/platform/reads";
import { makeChain, type ChainCall } from "./helpers/supabaseMock";

/**
 * INBOX v2 — the split view's list contract.
 *
 * The list is the one surface that composes four tables into one row (conversation, star,
 * handling, read watermark) plus a name lookup. Two properties matter more than any of the
 * individual joins:
 *
 *  1. **Every extra table is optional.** Stars, reads and handling ship behind their own
 *     migrations; an org whose migrations are not applied must still get a full, working list.
 *  2. **A missing reads table means NO badges, never "everything unread".** An inbox that
 *     shouts 181 unread because a table is absent is worse than one that stays quiet, and it is
 *     the kind of fabricated number CLAUDE.md's honesty rule exists to prevent.
 */

const ORG = "org-1";
const USER = "user-1";

/** A per-table fake: tables listed here answer; anything else answers like a missing table. */
function fakeDb(tables: Record<string, unknown[]>, log: ChainCall[] = []) {
  return {
    from: (table: string) =>
      makeChain(
        table in tables
          ? { data: tables[table], error: null, count: tables[table].length }
          : { data: null, error: { message: `relation "${table}" does not exist` } },
        log
      ),
  } as never;
}

const CALL = {
  id: "call-1",
  agent_id: "agent-1",
  from_phone: "+13215550123",
  lead_id: "lead-1",
  intent: "appointment",
  outcome: null,
  completion_state: "completed",
  transcript: "AI: Hello. User: I'd like to book a table.",
  duration_seconds: 65,
  direction: "inbound",
  started_at: "2026-08-27T10:00:00.000Z",
  ended_at: "2026-08-27T10:01:05.000Z",
  created_at: "2026-08-27T10:00:00.000Z",
};

const BASE = {
  calls: [CALL],
  conversations: [],
  agents: [{ id: "agent-1", name: "Front Desk" }],
  leads: [{ id: "lead-1", name: "Ada Lovelace" }],
};

describe("listInboxPage — one row from four tables", () => {
  it("resolves the contact's name, which the conversations read model leaves null for voice", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb(BASE));
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0].displayName).toBe("Ada Lovelace");
    expect(page.rows[0].handle).toBe("+13215550123");
    expect(page.rows[0].employeeName).toBe("Front Desk");
  });

  it("falls back to the handle rather than inventing a name when the lead is unknown", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb({ ...BASE, leads: [] }));
    expect(page.rows[0].displayName).toBeNull();
  });

  it("renders a full list when stars, reads and handling were never migrated", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb(BASE));
    expect(page.rows).toHaveLength(1);
    expect(page.canStar).toBe(false);
    expect(page.rows[0].starred).toBe(false);
    expect(page.rows[0].handling).toBe("ai");
  });

  it("shows NO unread badge when the reads table is unavailable", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb(BASE));
    expect(page.rows[0].unread).toBe(0);
  });

  it("counts an unopened call as one unread event, not one per transcript turn", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb({ ...BASE, conversation_reads: [] }));
    expect(page.rows[0].unread).toBe(1);
  });

  it("clears the badge once the viewer's watermark is past the last activity", async () => {
    const page = await listInboxPage(
      ORG,
      USER,
      {},
      fakeDb({
        ...BASE,
        conversation_reads: [
          { conversation_ref: "call-1", last_read_at: "2026-08-27T11:00:00.000Z" },
        ],
      })
    );
    expect(page.rows[0].unread).toBe(0);
  });

  it("marks the row starred and human-handled from their own tables", async () => {
    const page = await listInboxPage(
      ORG,
      USER,
      {},
      fakeDb({
        ...BASE,
        conversation_stars: [{ conversation_ref: "call-1" }],
        conversation_handling: [{ conversation_ref: "call-1" }],
      })
    );
    expect(page.rows[0].starred).toBe(true);
    expect(page.rows[0].handling).toBe("human");
    expect(page.canStar).toBe(true);
    expect(page.starredCount).toBe(1);
    expect(page.needsPersonCount).toBe(1);
  });

  it("the starred filter returns nothing at all when nothing is starred", async () => {
    const page = await listInboxPage(ORG, USER, { filter: "starred" }, fakeDb(BASE));
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
  });

  it("scopes every query to the caller's org — there is no RLS safety net here", async () => {
    const log: ChainCall[] = [];
    await listInboxPage(ORG, USER, {}, fakeDb({ ...BASE, conversation_reads: [] }, log));
    const orgFilters = log.filter(([m, args]) => m === "eq" && args[0] === "org_id");
    expect(orgFilters.length).toBeGreaterThan(0);
    expect(orgFilters.every(([, args]) => args[1] === ORG)).toBe(true);
  });

  it("never reports a total it cannot back up", async () => {
    const page = await listInboxPage(ORG, USER, {}, fakeDb(BASE));
    expect(page.total).toBe(1);
    expect(page.bounded).toBe(false);
    expect(page.hasMore).toBe(false);
  });
});

describe("isUnread — the watermark rule", () => {
  it("is unread when the viewer has no watermark for it", () => {
    expect(isUnread("2026-08-27T10:00:00.000Z", null)).toBe(true);
  });

  it("is read once the watermark is at or past the last activity", () => {
    expect(isUnread("2026-08-27T10:00:00.000Z", "2026-08-27T10:00:00.000Z")).toBe(false);
    expect(isUnread("2026-08-27T10:00:00.000Z", "2026-08-27T12:00:00.000Z")).toBe(false);
  });

  it("becomes unread again when something new arrives after the watermark", () => {
    expect(isUnread("2026-08-27T13:00:00.000Z", "2026-08-27T12:00:00.000Z")).toBe(true);
  });

  it("stays silent about anything that predates tracking, so an applied migration is not an alarm", () => {
    // The day the table lands, a shop's whole archive would otherwise badge itself at once.
    expect(isUnread("2026-08-25T10:00:00.000Z", null)).toBe(false);
    expect(isUnread(UNREAD_TRACKING_SINCE, null)).toBe(true);
  });

  it("says nothing when the table is unavailable", () => {
    expect(isUnread("2026-08-27T10:00:00.000Z", null, false)).toBe(false);
  });

  it("never guesses from junk timestamps", () => {
    expect(isUnread(null, null)).toBe(false);
    expect(isUnread("not-a-date", "also-not")).toBe(false);
  });
});

/**
 * The surface itself. These assertions are about promises the redesign makes to a customer —
 * each one is a thing that would be a lie, or a broken split view, if it silently regressed.
 */
const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("Inbox v2 — the split view", () => {
  it("keeps the list in the layout, so it survives every selection", () => {
    const layout = read("app/(app)/dashboard/inbox/layout.tsx");
    expect(layout).toMatch(/ConversationList/);
    expect(layout).toMatch(/listInboxPage/);
    // The page beside it is the empty pane, NOT a second copy of the list.
    expect(read("app/(app)/dashboard/inbox/page.tsx")).not.toMatch(/ConversationList/);
  });

  it("never offers a reply it cannot send, and says which channel it is talking about", () => {
    const composer = read("app/(app)/dashboard/inbox/_components/Composer.tsx");
    expect(composer).toMatch(/disabled/);
    expect(composer).toMatch(/meta\.label/);
    // No submit path exists at all — the control is inert, not merely styled as inert.
    expect(composer).not.toMatch(/onSubmit|onClick=\{/);
  });

  it("builds its channel chips from the registry, so a new channel needs no edit here", () => {
    const list = read("app/(app)/dashboard/inbox/_components/ConversationList.tsx");
    expect(list).toMatch(/CHANNEL_ORDER\.map/);
    expect(list).toMatch(/channelMeta\(c\)\.label/);
  });

  it("answers a channel it cannot receive on with the truth, not with \"no results\"", () => {
    const list = read("app/(app)/dashboard/inbox/_components/ConversationList.tsx");
    // The chip row shows every channel, so the empty state has to carry the honesty.
    expect(list).toMatch(/isn't connected yet/);
    expect(list).toMatch(/\/dashboard\/channels/);
  });

  it("keeps the messaging palette in one file, out of the rest of the dashboard", () => {
    const theme = read("app/(app)/dashboard/inbox/_components/theme.ts");
    expect(theme).toMatch(/#F3F2EE/); // the thread ground
    expect(theme).toMatch(/#E6F5EC/); // what we said
    expect(theme).toMatch(/#005C4B/); // and its dark-mode twin
  });

  it("still reaches the recording through the conversation, voice only", () => {
    const page = read("app/(app)/dashboard/inbox/[conversationId]/page.tsx");
    expect(page).toMatch(/getVoiceArtifacts/);
    expect(page).toMatch(/detail\.channel === "voice"/);
    expect(page).toMatch(/ContextRail/);
  });
});

/**
 * WHY OPENING A CONVERSATION HAS TO BE ONE STAGE.
 *
 * Every read the conversation page needs is keyed by the id already in the URL, so none of them
 * depends on another — but they used to run as a ladder: auth, then employee names, then the call,
 * then its tickets, then its appointments, then the recording. Opening a conversation cost the SUM
 * of those latencies instead of the longest, which is what made moving between conversations feel
 * slow. Measured against production data on 2026-08-27: 1794ms → 501ms, 3.6x.
 *
 * These are structural assertions because the regression is structural: re-introducing a single
 * `await` in the wrong place silently gives the latency back, and no unit test of behaviour would
 * notice.
 */
describe("the conversation opens in one round-trip stage", () => {
  const page = read("app/(app)/dashboard/inbox/[conversationId]/page.tsx");
  const readModel = read("lib/platform/readModel/conversations.ts");

  it("asks for the conversation, its handling, its star and its recording together", () => {
    expect(page).toMatch(/await Promise\.all\(\[/);
    expect(page).toMatch(/getConversationView\(orgId, conversationId\)/);
    expect(page).toMatch(/getHandlingStateWithAvailability/);
    expect(page).toMatch(/getStarWithAvailability/);
    expect(page).toMatch(/getVoiceArtifacts/);
  });

  it("no longer pays a second query just to ask whether a table exists", () => {
    // handlingAvailable() and starsAvailable() were HEAD counts answering what the read's own
    // error already answers.
    expect(page).not.toMatch(/handlingAvailable\(/);
    expect(page).not.toMatch(/starsAvailable\(/);
  });

  it("fetches the call, the chat row and both artifact kinds in parallel", () => {
    const fn = readModel.slice(readModel.indexOf("export async function getConversationView"));
    expect(fn).toMatch(/await Promise\.all\(\[/);
    // The old ladder awaited employeeNames before anything else could start.
    expect(fn).not.toMatch(/const names = await employeeNames/);
  });

  it("asks Postgres for the recording path instead of dragging the whole payload over", () => {
    const voice = read("lib/platform/readModel/voiceArtifacts.ts");
    expect(voice).toMatch(/raw_payload->message->artifact->>recordingUrl/);
    // 77KB per conversation opened, for one string.
    expect(voice).not.toMatch(/\.select\("cost_usd, duration_seconds, raw_payload"\)/);
  });

  it("shares one auth round-trip between the layout and the page", () => {
    const org = read("lib/platform/serverOrg.ts");
    expect(org).toMatch(/import \{ cache \} from "react"/);
    expect(org).toMatch(/export const resolveViewer = cache\(/);
  });
});

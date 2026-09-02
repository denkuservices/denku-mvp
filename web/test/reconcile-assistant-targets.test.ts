import { describe, it, expect, vi } from "vitest";

// The route module imports the fail-fast service-role client at load time. This suite
// exercises the pure set-builder only, so the client never has to exist.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { collectAssistantTargets } from "@/app/api/internal/reconcile-vapi-assistants/route";

/**
 * Which assistants a reconcile pass reaches.
 *
 * The bug this pins was found on 2026-09-03, in production, right after a reconcile that
 * reported `{"ok":true,"total":3,"succeeded":3,"failed":0}`. Vapi held FOUR assistants, and
 * the fourth — `ca9cf616…` — was bound to `+13213928560`, a line with `status: 'live'`. Its
 * id was recorded on `phone_lines.vapi_assistant_id`; it had no `agents` row at all. The
 * endpoint iterated `agents`, so it could not have reached it, and said `ok: true` anyway
 * because every row it knew about did succeed.
 *
 * That is the shape worth guarding: a reconcile that silently covers a subset is worse than
 * one that fails, because the missing line keeps answering with a stale tool set and nothing
 * ever says so. These tests run against the pure set-builder — mocking Vapi would prove the
 * PATCH works on assistants that were never in the list.
 */
describe("collectAssistantTargets", () => {
  it("reaches an assistant that only a phone line knows about (the 2026-09-03 case)", () => {
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: "155b21ad" }],
      [{ vapi_assistant_id: "ca9cf616", vapi_assistant_id_paused_backup: null }],
    );

    expect(targets.map((t) => t.assistantId).sort()).toEqual(["155b21ad", "ca9cf616"]);
  });

  it("flags the phone-line-only assistant as untracked, so a missing agents row is visible", () => {
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: "155b21ad" }],
      [{ vapi_assistant_id: "ca9cf616" }],
    );

    const untracked = targets.filter((t) => !t.sources.includes("agents"));
    expect(untracked.map((t) => t.assistantId)).toEqual(["ca9cf616"]);
  });

  it("includes a paused line's backed-up assistant — it answers again the day billing resumes", () => {
    // Pausing PATCHes the line to `assistantId: null` and parks the real id in the backup
    // column. Skipping it would leave an assistant that is missing its tools on the day
    // nobody is looking: un-pause.
    const targets = collectAssistantTargets(
      [],
      [{ vapi_assistant_id: null, vapi_assistant_id_paused_backup: "84218bf2" }],
    );

    expect(targets).toEqual([{ assistantId: "84218bf2", sources: ["phone_lines_paused"] }]);
  });

  it("PATCHes an assistant once when both tables name it, and records both sources", () => {
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: "fcd63f02" }],
      [{ vapi_assistant_id: "fcd63f02" }],
    );

    expect(targets).toHaveLength(1);
    expect(targets[0].sources.sort()).toEqual(["agents", "phone_lines"]);
  });

  it("dedupes duplicate agent rows pointing at one assistant", () => {
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: "155b21ad" }, { vapi_assistant_id: "155b21ad" }],
      [],
    );

    expect(targets).toEqual([{ assistantId: "155b21ad", sources: ["agents"] }]);
  });

  it("ignores nulls, undefined and blank strings rather than PATCHing an empty id", () => {
    // Most rows in both tables carry no assistant id: an agent created before activation,
    // a BYO line whose assistant lives on `agents` instead. A blank id would become
    // `PATCH /assistant/` — a request against the collection, not a member.
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: null }, { vapi_assistant_id: "  " }, {}],
      [{ vapi_assistant_id: undefined, vapi_assistant_id_paused_backup: "" }],
    );

    expect(targets).toEqual([]);
  });

  it("trims an id, so whitespace does not split one assistant into two targets", () => {
    const targets = collectAssistantTargets(
      [{ vapi_assistant_id: " 155b21ad " }],
      [{ vapi_assistant_id: "155b21ad" }],
    );

    expect(targets).toHaveLength(1);
    expect(targets[0].assistantId).toBe("155b21ad");
  });
});

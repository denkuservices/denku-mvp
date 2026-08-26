import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpokenTime, zoneOffsetMinutes } from "@/lib/time/spokenTime";

/**
 * THE NEVER-DEAD-END GUARANTEE, FOR APPOINTMENTS.
 *
 * CLAUDE.md's first product rule is that every finished call produces an artifact even if the
 * model never calls a tool. For tickets that held. For appointments it never did: the guarantee's
 * insert named a `source` column that does not exist on `appointments`, and omitted `start_at`,
 * which was NOT NULL — so PostgREST rejected every one of them and a console.error swallowed it.
 * The product shipped with 92 tickets and, across its entire history, zero appointments. The first
 * call that ever reached this path (2026-08-27) is what exposed it.
 *
 * These assertions are deliberately about the SHAPE of the write, because that is what broke: no
 * unit test can catch a column name the database does not have, but it can catch the column name
 * coming back.
 */

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const webhook = read("app/api/webhooks/vapi/route.ts");
const tool = read("app/api/tools/create-appointment/route.ts");

describe("ensureAppointmentForCall — the write must match the table", () => {
  it("never sends a `source` column, which appointments does not have", () => {
    const insertBlock = webhook.slice(
      webhook.indexOf("async function ensureAppointmentForCall"),
      webhook.indexOf("async function ensureAppointmentForCall") + 4000
    );
    expect(insertBlock).toMatch(/\.from\("appointments"\)/);
    expect(insertBlock).not.toMatch(/source:\s*"voice"/);
  });

  it("always supplies start_at, even when it is null", () => {
    const insertBlock = webhook.slice(
      webhook.indexOf("async function ensureAppointmentForCall"),
      webhook.indexOf("async function ensureAppointmentForCall") + 4000
    );
    expect(insertBlock).toMatch(/start_at:\s*startAt/);
    expect(insertBlock).toMatch(/status:\s*"requested"/);
  });

  it("resolves the caller's phrasing in the EMPLOYEE's timezone, not the server's", () => {
    expect(webhook).toMatch(/parseSpokenTime/);
    expect(webhook).toMatch(/agentTimezone/);
    // The timezone is read from the agent that handled the call, org-scoped like every other read.
    expect(webhook).toMatch(/\.from\("agents"\)\s*\n\s*\.select\("timezone"\)/);
  });
});

/**
 * The parsing rule itself, exercised against chrono directly — a timezone bug here books a
 * customer at the wrong hour, which is worse than not booking them at all.
 */
describe("what the caller said becomes an instant", () => {
  const REF = new Date("2026-08-27T12:00:00.000Z");

  /**
   * The bug this guards: chrono accepts a timezone ABBREVIATION or a numeric offset, and silently
   * ignores an IANA name — which is the only form we store. Passing "America/New_York" straight to
   * chrono resolves the phrase in the machine's own zone and no error is raised anywhere.
   */
  it("resolves a phrase in the business's IANA zone, not the machine's", () => {
    const d = parseSpokenTime("tomorrow at 5 PM", "America/New_York", REF);
    expect(d).toBeTruthy();
    // 17:00 in New York on 2026-08-28 is 21:00 UTC (EDT, UTC-4).
    expect(d!.toISOString()).toBe("2026-08-28T21:00:00.000Z");
  });

  it("the same phrase in another zone is a different instant — which is the whole point", () => {
    const ny = parseSpokenTime("tomorrow at 5 PM", "America/New_York", REF);
    const ist = parseSpokenTime("tomorrow at 5 PM", "Europe/Istanbul", REF);
    expect(ny!.toISOString()).not.toBe(ist!.toISOString());
    expect(ist!.toISOString()).toBe("2026-08-28T14:00:00.000Z"); // 17:00 UTC+3
  });

  it("knows an offset changes with daylight saving", () => {
    expect(zoneOffsetMinutes("America/New_York", new Date("2026-08-27T12:00:00Z"))).toBe(-240);
    expect(zoneOffsetMinutes("America/New_York", new Date("2026-01-27T12:00:00Z"))).toBe(-300);
    expect(zoneOffsetMinutes("UTC", REF)).toBe(0);
  });

  it("returns nothing for a phrase with no time in it, so the request stays open", () => {
    expect(parseSpokenTime("sometime soon, I'll call back", "America/New_York", REF)).toBeNull();
    expect(parseSpokenTime("", "America/New_York", REF)).toBeNull();
    expect(parseSpokenTime(null, "America/New_York", REF)).toBeNull();
  });

  it("falls back to the runtime zone rather than failing on an unknown one", () => {
    expect(zoneOffsetMinutes("Mars/Olympus", REF)).toBeNull();
    expect(parseSpokenTime("tomorrow at 5 PM", "Mars/Olympus", REF)).toBeTruthy();
  });
});

/**
 * The in-call path. The guarantee is the safety net; this is the thing that decides whether the
 * assistant told the caller the truth while they were still on the line.
 */
describe("create_appointment tool — a partial call is not a failed call", () => {
  it("treats Vapi's empty strings as 'not provided'", () => {
    // Vapi pads every declared property the model did not fill with "". Under the old schema that
    // tripped lead_phone's .min(7) and rejected the whole booking.
    expect(tool).toMatch(/optionalText/);
    expect(tool).toMatch(/trim\(\) === ""/);
    expect(tool).not.toMatch(/lead_phone:\s*z\.string\(\)\.min\(7\)/);
  });

  it("no longer requires the business's phone number to identify the org", () => {
    expect(tool).not.toMatch(/to_phone:\s*z\.string\(\)\.min\(3\)/);
    // A web call has no number, so the call record answers instead.
    expect(tool).toMatch(/from\("calls"\)\.select\("org_id"\)/);
  });

  it("still prefers the phone lookup when a number is present", () => {
    const orgBlock = tool.slice(tool.indexOf("/* org"), tool.indexOf("/* org") + 1200);
    expect(orgBlock.indexOf("organizations")).toBeLessThan(orgBlock.indexOf('from("calls")'));
  });
});

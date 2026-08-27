import { describe, it, expect, vi } from "vitest";

// The read model's module graph reaches the fail-fast service-role client.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSpokenTime, zoneOffsetMinutes } from "@/lib/time/spokenTime";
import { formatAppointmentTitle } from "@/lib/platform/readModel/conversations";

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

  /**
   * The second failure the first web booking exposed, after validation stopped rejecting it: the
   * model has no reason to know a call id and never sends one, so "resolve the org from the call"
   * had nothing to resolve from and answered org_not_found. Vapi fills this header itself.
   */
  it("takes the call id from Vapi's own header, not from the model's goodwill", () => {
    expect(tool).toMatch(/x-vapi-call-id/);
    expect(tool).toMatch(/headerCallId/);
    // Body parameters still win when the caller supplies them.
    expect(tool).toMatch(/input\.vapi_call_id \|\| headerCallId/);
  });

  /**
   * The platform knows the caller's number; the model does not need to ask for it. Watching a
   * real booking: "could you provide your phone number?" — "you can take the number I'm already
   * calling you with". Vapi sends `{{customer.number}}` on the tool call instead.
   */
  it("takes the caller's number from Vapi, and prefers the call record over it", () => {
    expect(tool).toMatch(/x-vapi-customer-number/);
    const chain = tool.slice(tool.indexOf("const leadPhone ="), tool.indexOf("const leadPhone =") + 320);
    expect(chain.indexOf("callFromPhone")).toBeLessThan(chain.indexOf("headerCustomerNumber"));
    expect(chain.indexOf("headerCustomerNumber")).toBeLessThan(chain.indexOf("input.lead_phone"));
  });

  it("writes down the tool contract that lives in the Vapi account", () => {
    // The definition is not in this repo; the handler that depends on it says what it must be.
    expect(tool).toMatch(/x-vapi-call-id\s+\{\{call\.id\}\}/);
    expect(tool).toMatch(/x-vapi-customer-number\s+\{\{customer\.number\}\}/);
    expect(tool).toMatch(/never make the model collect something the platform already/i);
  });

  /**
   * The rule the owner asked for: ask only when we genuinely have nothing. The model cannot know
   * which case it is in — on a phone call the platform holds the number, on a web chat it never
   * will — so the ROUTE decides and says so in its answer, and the assistant only relays.
   */
  it("tells the assistant whether to ask, instead of leaving it to guess", () => {
    expect(tool).toMatch(/needs: "lead_phone"/);
    expect(tool).toMatch(/ask them for one, then call/i);
    expect(tool).toMatch(/do not ask for one\.?"/i);
    expect(tool).toMatch(/const needsCallbackNumber = !leadPhoneUsed/);
  });

  it("asking again corrects the booking instead of duplicating it", () => {
    // The assistant is told to call a second time with the number; two rows on the owner's
    // calendar for one conversation would be our bookkeeping leaking into their day.
    expect(tool).toMatch(/\.eq\("call_id", resolvedCallId\)/);
    expect(tool).toMatch(/existing\s*\?/);
    expect(tool).toMatch(/lead_id: leadId \?\? undefined/);
  });

  it("still prefers the phone lookup when a number is present", () => {
    // The business number identifies the org when it is there; the call record is the fallback.
    const byPhone = tool.indexOf('.from("organizations")');
    const byCall = tool.indexOf('from("calls").select("org_id")');
    expect(byPhone).toBeGreaterThan(-1);
    expect(byCall).toBeGreaterThan(-1);
    expect(byPhone).toBeLessThan(byCall);
  });

  /**
   * The third face of the same assumption, found on the third test call: told it needed a phone
   * number, the assistant asked the caller for one — and the route still refused, because it
   * insisted on resolving a LEAD before it would write a booking. A web call has no caller ID, and
   * neither will Web Chat, Telegram or Email.
   */
  it("writes the booking even when nobody's phone number can be found", () => {
    expect(tool).not.toMatch(/return NextResponse\.json\(\{ error: "invalid_phone" \}/);
    expect(tool).toMatch(/A booking without a contact is still a booking/);
    expect(tool).toMatch(/leadId = null;/);
  });
});

/**
 * What the owner actually sees.
 *
 * The first appointment ever to reach this UI (2026-08-27) rendered as
 * "2026-08-28T17:00:00+00:…" — the machine's spelling, in UTC, truncated by the column it sat in,
 * on the one surface a shop owner opens to see what their AI booked.
 */
describe("an appointment reads like a time, in the business's hours", () => {
  it("shows the business's local time, not UTC", () => {
    expect(formatAppointmentTitle("2026-08-28T17:00:00+00:00", "America/New_York")).toBe(
      "Fri, Aug 28, 1:00 PM"
    );
  });

  it("moves with the timezone it is given", () => {
    const utc = formatAppointmentTitle("2026-08-28T17:00:00+00:00", "UTC");
    const ny = formatAppointmentTitle("2026-08-28T17:00:00+00:00", "America/New_York");
    expect(utc).not.toBe(ny);
  });

  it("says so in words when no time was agreed", () => {
    expect(formatAppointmentTitle(null, "America/New_York")).toBe("Time to confirm");
    expect(formatAppointmentTitle("not-a-date", "America/New_York")).toBe("Time to confirm");
  });

  it("never crashes on a timezone the runtime does not know", () => {
    expect(formatAppointmentTitle("2026-08-28T17:00:00+00:00", "Mars/Olympus")).toMatch(/2026/);
  });
});

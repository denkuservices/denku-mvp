import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  requestHref,
  appointmentHref,
  ticketToRequest,
  appointmentToRequest,
} from "@/lib/platform/readModel/requests";
import { findRecordingUrl } from "@/lib/platform/readModel/voiceArtifacts";

const SRC = path.join(process.cwd(), "src");
const APP_DIR = path.join(SRC, "app", "(app)");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}
function routeExists(href: string): boolean {
  const rel = href.replace(/^\//, "").split("#")[0].split("?")[0];
  return fs.existsSync(path.join(APP_DIR, rel, "page.tsx"));
}

/**
 * SPRINT 13 — "REQUESTS WHOLE".
 *
 * Tickets and appointments were one concept split across two tables, and the UI kept that split
 * alive in two URL shapes and two visual languages. A call, meanwhile, was a conversation you had
 * to leave in order to hear. Both are closed here.
 *
 * The sprint's stated risk is that ticket status transitions and recording playback must not
 * regress — so the ticket body was moved intact rather than rewritten, and these tests check the
 * pieces that carry that behaviour are still present.
 */
describe("first-class CRM routes for both request types", () => {
  it("tickets and appointments produce dedicated href shapes", () => {
    expect(requestHref("ticket", "t1")).toBe("/dashboard/crm/requests/t1?type=ticket");
    expect(requestHref("appointment", "a1")).toBe("/dashboard/crm/appointments/a1");
    expect(appointmentHref("a1")).toBe(requestHref("appointment", "a1"));
  });

  it("the read model emits those hrefs for both types", () => {
    const ticket = ticketToRequest({
      id: "t1",
      subject: "Leak",
      description: null,
      status: "open",
      priority: "normal",
      created_at: "2026-08-01T00:00:00Z",
      call_id: null,
      lead_id: null,
    });
    const appointment = appointmentToRequest({
      id: "a1",
      notes: null,
      status: "scheduled",
      start_at: "2026-09-01T10:00:00Z",
      created_at: "2026-08-01T00:00:00Z",
      call_id: null,
      lead_id: null,
    });
    expect(ticket.href).toBe("/dashboard/crm/requests/t1?type=ticket");
    expect(appointment.href).toBe("/dashboard/crm/appointments/a1");
    // The legacy ticket URL is no longer produced anywhere.
    expect(ticket.href).not.toMatch(/\/dashboard\/tickets\//);
  });

  it("both detail routes exist and old request links forward appointments", () => {
    expect(routeExists("/dashboard/crm/requests/[requestId]")).toBe(true);
    expect(routeExists("/dashboard/crm/appointments/[appointmentId]")).toBe(true);
    const page = readCode("app/(app)/dashboard/crm/requests/[requestId]/page.tsx");
    expect(page).toMatch(/TicketDetailBody/);
    expect(page).toMatch(/getAppointmentDetail/);
    expect(page).toMatch(/redirect\(`\/dashboard\/crm\/appointments\/\$\{requestId\}`\)/);
  });

  it("the type hint is not trusted as a security boundary", () => {
    // The appointment read is org-scoped regardless of what the query param claims.
    const page = readCode("app/(app)/dashboard/crm/requests/[requestId]/page.tsx");
    expect(page).toMatch(/resolveActiveOrgId/);
    expect(page).toMatch(/getAppointmentDetail\(orgId, requestId\)/);
  });

  it("the interim appointment-only route is gone, replaced not duplicated", () => {
    expect(exists("app/(app)/dashboard/crm/requests/appointment")).toBe(false);
    expect(routeExists("/dashboard/crm/appointments")).toBe(true);
  });
});

describe("the ticket body moved intact — transitions must not regress", () => {
  const body = read("app/(app)/dashboard/crm/requests/[requestId]/TicketDetailBody.tsx");

  it("still renders the status/priority form, quick actions, comments and activity", () => {
    expect(body).toMatch(/TicketDetailForm/);
    expect(body).toMatch(/TicketDetailQuickActions/);
    expect(body).toMatch(/TicketPrimaryAction/);
    expect(body).toMatch(/TicketComments/);
    expect(body).toMatch(/TicketActivity/);
  });

  it("still reads through the same queries and respects the paused workspace", () => {
    expect(body).toMatch(/getTicketDetail/);
    expect(body).toMatch(/getDistinctStatuses/);
    expect(body).toMatch(/getDistinctPriorities/);
    expect(body).toMatch(/getWorkspaceStatus/);
    expect(body).toMatch(/isAdminOrOwner/);
  });

  it("its back-links point at Requests, not the retired Tickets list", () => {
    expect(readCode("app/(app)/dashboard/crm/requests/[requestId]/TicketDetailBody.tsx")).not.toMatch(
      /href="\/dashboard\/tickets"/
    );
  });
});

describe("creating a request happens inside Requests", () => {
  it("the new-request page exists and reuses the existing form", () => {
    expect(routeExists("/dashboard/crm/requests/new")).toBe(true);
    const page = read("app/(app)/dashboard/crm/requests/new/page.tsx");
    expect(page).toMatch(/NewTicketForm/);
  });

  it("the Requests list points at it", () => {
    expect(readCode("app/(app)/dashboard/crm/requests/page.tsx")).toMatch(/\/dashboard\/crm\/requests\/new/);
  });
});

describe("a call is a conversation", () => {
  it("the recording renders in the conversation rail", () => {
    const rail = readCode("app/(app)/dashboard/_platform/conversation/ContextRail.tsx");
    expect(rail).toMatch(/<audio/);
    // No longer a link out to the legacy page.
    expect(rail).not.toMatch(/\/dashboard\/calls\//);
  });

  it("the conversation page fetches them for voice only", () => {
    const page = readCode("app/(app)/dashboard/inbox/[conversationId]/page.tsx");
    expect(page).toMatch(/getVoiceArtifacts/);
    expect(page).toMatch(/detail\.channel === "voice"/);
  });

  /**
   * Sprint 13 rendered `calls.cost_usd` here as "Cost". That column is COGS - what Denku pays
   * Vapi (`lib/billing/reconciliation.ts`) - not what the customer is charged, so every
   * conversation published our margin, and did it wrongly: a 25-second call showed "$0.07" while
   * the customer is billed a full minute at their plan rate. The rail now shows how the call
   * counted against their allowance, using the golden-master rounding rule.
   */
  it("never shows the customer what the call cost US", () => {
    const rail = read("app/(app)/dashboard/_platform/conversation/ContextRail.tsx");
    expect(rail).not.toMatch(/\$\{voice\.costUsd/);
    expect(rail).not.toMatch(/costUsd\.toFixed/);
  });

  it("shows what the call cost THEM, via the golden-master rounding rule", () => {
    const rail = read("app/(app)/dashboard/_platform/conversation/ContextRail.tsx");
    expect(rail).toMatch(/billableMinutesForCall\(voice\.durationSeconds\)/);
    // Sourced from the billing golden master, never a local ceil() that could drift from it.
    expect(rail).toMatch(/from "@\/lib\/billing\/usageMath"/);
  });

  it("finds the recording URL in every payload shape seen in production", () => {
    expect(findRecordingUrl({ message: { artifact: { recordingUrl: "https://a" } } })).toBe("https://a");
    expect(findRecordingUrl({ message: { artifact: { stereoRecordingUrl: "https://b" } } })).toBe("https://b");
    expect(findRecordingUrl({ artifact: { recording: { stereoUrl: "https://c" } } })).toBe("https://c");
    expect(findRecordingUrl({ artifact: { recording: { mono: { combinedUrl: "https://d" } } } })).toBe("https://d");
  });

  it("returns null rather than a broken player for junk or non-http values", () => {
    expect(findRecordingUrl(null)).toBeNull();
    expect(findRecordingUrl("nope")).toBeNull();
    expect(findRecordingUrl({ message: { artifact: { recordingUrl: "file:///etc/passwd" } } })).toBeNull();
    expect(findRecordingUrl({})).toBeNull();
  });
});

describe("nothing was hidden", () => {
  it("every retired URL still resolves and forwards to something that exists", () => {
    const pairs: Array<[string, string]> = [
      ["/dashboard/tickets/[ticketId]", "/dashboard/crm/requests/[requestId]"],
      ["/dashboard/tickets/new", "/dashboard/crm/requests/new"],
      ["/dashboard/calls/[callId]", "/dashboard/inbox/[conversationId]"],
    ];
    const broken: string[] = [];
    for (const [from, to] of pairs) {
      if (!routeExists(from)) broken.push(`${from} (missing redirect)`);
      if (!routeExists(to)) broken.push(`${to} (missing target)`);
    }
    expect(broken).toEqual([]);
  });

  it("those redirects fall back to the legacy list with the platform experience off", () => {
    for (const p of [
      "app/(app)/dashboard/tickets/[ticketId]/page.tsx",
      "app/(app)/dashboard/tickets/new/page.tsx",
      "app/(app)/dashboard/calls/[callId]/page.tsx",
    ]) {
      expect(readCode(p)).toMatch(/platformUxEnabled/);
    }
  });
});

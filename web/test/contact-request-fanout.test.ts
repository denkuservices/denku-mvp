import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The fanout module imports the fail-fast service-role client; these tests exercise the pure
// builder and the shipped wiring, never the network.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { buildContactRequestTicket } from "@/lib/marketing/contactRequestFanout";
import { contactRequestTemplate, sourceLabel } from "@/lib/email/templates/contactRequest";

const SRC = path.join(process.cwd(), "src");
function readCode(rel: string): string {
  return fs
    .readFileSync(path.join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * A REQUEST FROM THE WEBSITE HAS TO REACH A HUMAN (2026-09-03).
 *
 * `POST /api/marketing/contact` wrote a row into `contact_requests` and stopped — no email, no
 * ticket, and nothing in the product read that table. A real submission was found sitting there
 * with nobody aware of it. Two deliveries now: mail to the support address, and a ticket in the
 * workspace Denku runs itself on.
 */
describe("buildContactRequestTicket", () => {
  const base = { id: "req-1", work_email: "ahmet@example.com" };

  it("names the form and the person in the subject", () => {
    const t = buildContactRequestTicket({
      ...base,
      name: "Ahmet Yilmaz",
      source: "request_custom-ai",
    });
    expect(t.subject).toBe("Custom AI request — Ahmet Yilmaz");
  });

  it("falls back to company, then to the email, so a subject is never half-written", () => {
    expect(buildContactRequestTicket({ ...base, company: "Yilmaz Dental" }).subject).toContain(
      "Yilmaz Dental"
    );
    expect(buildContactRequestTicket(base).subject).toContain("ahmet@example.com");
  });

  it("keeps every field the tickets table has no column for", () => {
    const t = buildContactRequestTicket({
      ...base,
      industry: "healthcare",
      channels: ["Voice", "WhatsApp"],
      tools: "Voice AI",
      estimated_volume: "1-10k",
      message: "We miss calls after 6pm.",
    });
    expect(t.description).toContain("Industry: healthcare");
    expect(t.description).toContain("Channels: Voice, WhatsApp");
    expect(t.description).toContain("Estimated volume: 1-10k");
    expect(t.description).toContain("We miss calls after 6pm.");
  });

  it("omits blank fields instead of printing empty labels", () => {
    const t = buildContactRequestTicket(base);
    expect(t.description).not.toContain("Industry:");
    expect(t.description).not.toContain("Message:");
  });

  it("carries the requester so the ticket can be replied to", () => {
    const t = buildContactRequestTicket({ ...base, name: "Ahmet Yilmaz" });
    expect(t.requesterEmail).toBe("ahmet@example.com");
    expect(t.requesterName).toBe("Ahmet Yilmaz");
  });
});

describe("sourceLabel", () => {
  it("names each form the way a human would", () => {
    expect(sourceLabel("request_custom-ai")).toBe("Custom AI");
    expect(sourceLabel("request_ai-employees")).toBe("AI Employees");
    expect(sourceLabel("marketing_contact")).toBe("Contact form");
  });

  it("never prints a raw enum at a reader", () => {
    // The route allowlists `source`, but a row written before that allowlist existed must not
    // reach a person as `request_something_unknown`.
    expect(sourceLabel("something_else")).toBe("Contact form");
    expect(sourceLabel(null)).toBe("Contact form");
  });
});

describe("the notification email", () => {
  it("leads with the person and their own words", () => {
    const { subject, html } = contactRequestTemplate({
      workEmail: "ahmet@example.com",
      name: "Ahmet Yilmaz",
      message: "We miss calls after 6pm.",
      source: "request_custom-ai",
      ticketUrl: "https://www.denku.io/dashboard/tickets/abc",
    });
    expect(subject).toBe("Custom AI request — Ahmet Yilmaz");
    expect(html).toContain("ahmet@example.com");
    expect(html).toContain("We miss calls after 6pm.");
    expect(html).toContain("https://www.denku.io/dashboard/tickets/abc");
  });

  it("drops the button when the ticket was not created, rather than linking nowhere", () => {
    const { html } = contactRequestTemplate({
      workEmail: "ahmet@example.com",
      source: "marketing_contact",
      ticketUrl: null,
    });
    expect(html).not.toContain("/dashboard/tickets/");
    expect(html).toMatch(/did not become a ticket/i);
  });

  it("renders in Turkish when that is the team's language", () => {
    const { subject, html } = contactRequestTemplate({
      workEmail: "ahmet@example.com",
      name: "Ahmet Yilmaz",
      source: "request_custom-ai",
      locale: "tr",
    });
    expect(subject).toContain("talebi");
    expect(html).toContain("Biri sizinle konuşmak istiyor");
  });
});

describe("the wiring", () => {
  const ROUTE = readCode("app/api/marketing/contact/route.ts");
  const FANOUT = readCode("lib/marketing/contactRequestFanout.ts");

  it("delivers after the row is written, and cannot fail the form", () => {
    // The row in `contact_requests` is the record; the notification is not worth losing a lead for.
    expect(ROUTE).toMatch(/await fanoutContactRequest\(/);
    expect(ROUTE).toMatch(/catch \(fanoutError\)/);
  });

  it("sends to the support address rather than a hardcoded inbox", () => {
    expect(FANOUT).toMatch(/getSupportEmail\(\)/);
  });

  it("files the ticket in Denku's own workspace, org-scoped", () => {
    expect(FANOUT).toMatch(/DENKU_SELF_ORG_ID/);
    expect(FANOUT).toMatch(/org_id:\s*orgId/);
  });

  it("claims the send once per submission", () => {
    expect(FANOUT).toMatch(/kind:\s*"contact_request"/);
    expect(FANOUT).toMatch(/dedupeKey:\s*row\.id/);
  });

  it("leaves call_id and conversation_id unset so no sweep mails it twice", () => {
    // Both artifact-notification sweeps select on those columns; a null keeps this ticket out.
    expect(FANOUT).not.toMatch(/call_id:/);
    expect(FANOUT).not.toMatch(/conversation_id:/);
  });
});

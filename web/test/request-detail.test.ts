import { describe, it, expect, vi } from "vitest";

// Both modules under test reach the service-role client at import time. Nothing here touches a
// database — these are pure functions — so the client is stubbed rather than configured.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { splitAppointmentNotes } from "@/app/(app)/dashboard/_platform/crm/appointmentNotes";
import { draftLanguageName } from "@/lib/platform/knowledgeDraft";
import { channelIsAssignable } from "@/lib/platform/assignEmployee";

/**
 * Three small decisions that each fixed a real thing a customer saw.
 */

describe("splitAppointmentNotes", () => {
  it("treats a multi-turn dump as the conversation, not as a note", () => {
    // This is exactly what the deterministic booking path writes into `appointments.notes`, and
    // rendering it as a paragraph is what produced the wall of text on the detail page.
    const notes = [
      "AI: Hi. This is Denku. How can I help you today?",
      "User: I'd like to book an appointment for tomorrow afternoon at 1 PM.",
      "AI: Sure. I'll book that for you.",
    ].join("\n");

    const { note, transcript } = splitAppointmentNotes(notes);
    expect(note).toBeNull();
    expect(transcript).toContain("I'd like to book an appointment");
  });

  it("keeps a short human note as a note", () => {
    const { note, transcript } = splitAppointmentNotes("Wants the corner table.");
    expect(note).toBe("Wants the corner table.");
    expect(transcript).toBeNull();
  });

  it("strips the internal provenance marker rather than printing it at a customer", () => {
    const { note } = splitAppointmentNotes(
      "Bringing two guests.\n[System] created_by=deterministic"
    );
    expect(note).toBe("Bringing two guests.");
    expect(note).not.toContain("created_by");
  });

  it("returns nothing when the marker was the only content", () => {
    expect(splitAppointmentNotes("[System] created_by=deterministic")).toEqual({
      note: null,
      transcript: null,
    });
  });

  it("handles empty and null notes", () => {
    expect(splitAppointmentNotes(null)).toEqual({ note: null, transcript: null });
    expect(splitAppointmentNotes("   ")).toEqual({ note: null, transcript: null });
  });
});

describe("draftLanguageName", () => {
  it("names the language the employee is configured to speak", () => {
    expect(draftLanguageName("tr")).toBe("Turkish");
    expect(draftLanguageName("es")).toBe("Spanish");
  });

  it("accepts a regional tag", () => {
    expect(draftLanguageName("en-GB")).toBe("English");
    expect(draftLanguageName("pt_BR")).toBe("Portuguese");
  });

  it("falls back to English rather than guessing from the material", () => {
    // The old rule — "write in whatever language the business used" — is what put Turkish
    // sentences under English labels in an English interface.
    expect(draftLanguageName(null)).toBe("English");
    expect(draftLanguageName("")).toBe("English");
    expect(draftLanguageName("kl")).toBe("English");
  });
});

describe("channelIsAssignable", () => {
  it("is true for every channel whose registry entry names an owner column", () => {
    for (const channel of ["voice", "telegram", "email", "web"] as const) {
      expect(channelIsAssignable(channel)).toBe(true);
    }
  });

  it("is false for a channel that cannot be owned by an employee", () => {
    // Instagram is receive-only and its connection carries no owner column, so offering an
    // assignment control for it would be a button that silently does nothing.
    expect(channelIsAssignable("instagram")).toBe(false);
    expect(channelIsAssignable("whatsapp")).toBe(false);
  });
});

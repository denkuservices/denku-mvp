import { describe, it, expect } from "vitest";
import { initialsOf } from "@/app/(app)/dashboard/_platform/Avatar";

/**
 * Avatars exist so a list row has an anchor you can find by shape and colour before reading it.
 * We have no photographs, so the whole primitive rests on one honest rule: derive initials from a
 * NAME, and show a neutral glyph for anything that is not one.
 *
 * The temptation is to squeeze a letter out of whatever is available — "+1" from a phone number,
 * "U" from "Unknown contact" — which produces something that looks like identity and is not. Most
 * of a voice workspace's contacts are bare phone numbers, so that failure would be the common case
 * rather than the edge one.
 */
describe("avatar initials come from names, or not at all", () => {
  it("takes up to two initials from a person's name", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("ada lovelace")).toBe("AL");
    expect(initialsOf("Ada")).toBe("A");
    expect(initialsOf("  Ada   Byron   Lovelace ")).toBe("AB");
  });

  it("returns null for identifiers that only look like names", () => {
    expect(initialsOf("+13213315718")).toBeNull();
    expect(initialsOf("3214456677")).toBeNull();
    expect(initialsOf("+")).toBeNull();
    expect(initialsOf("123 456")).toBeNull();
  });

  it("returns null for nothing at all", () => {
    expect(initialsOf(null)).toBeNull();
    expect(initialsOf(undefined)).toBeNull();
    expect(initialsOf("")).toBeNull();
    expect(initialsOf("   ")).toBeNull();
  });

  it("handles names that mix letters and symbols", () => {
    // A number-prefixed business name still has a real initial in it.
    expect(initialsOf("24/7 Plumbing")).toBe("P");
    expect(initialsOf("O'Brien Dental")).toBe("OD");
  });

  it("works outside the Latin alphabet", () => {
    // Turkish and Spanish customers are the two this product actually ships for.
    expect(initialsOf("Özge Yılmaz")).toBe("ÖY");
    expect(initialsOf("Álvaro Núñez")).toBe("ÁN");
  });
});

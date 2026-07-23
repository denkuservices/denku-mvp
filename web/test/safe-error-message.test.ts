import { describe, it, expect } from "vitest";
import { safeErrorMessage, DEFAULT_ERROR_MESSAGE } from "@/lib/errors/safeErrorMessage";

/**
 * R-021 — the user must never see a raw upstream error string. safeErrorMessage
 * maps a few safe categories and otherwise returns a generic fallback.
 */
describe("safeErrorMessage", () => {
  it("never returns the raw provider string for an unknown DB error", () => {
    const raw =
      'duplicate key value violates unique constraint "calls_vapi_call_id_key"';
    const out = safeErrorMessage(new Error(raw));
    expect(out).toBe(DEFAULT_ERROR_MESSAGE);
    expect(out).not.toContain("constraint");
    expect(out).not.toContain("vapi_call_id");
  });

  it("maps network/timeout errors to a connection message", () => {
    expect(safeErrorMessage(new Error("Failed to fetch"))).toMatch(/reach the server/i);
    expect(safeErrorMessage("Request timed out")).toMatch(/reach the server/i);
  });

  it("maps auth errors to a session message", () => {
    expect(safeErrorMessage(new Error("JWT expired"))).toMatch(/session has expired/i);
    expect(safeErrorMessage({ message: "Unauthorized" })).toMatch(/session has expired/i);
  });

  it("maps permission errors", () => {
    expect(safeErrorMessage(new Error("permission denied for table orgs"))).toMatch(
      /permission/i
    );
  });

  it("maps rate-limit errors", () => {
    expect(safeErrorMessage("Too many requests")).toMatch(/too many requests/i);
  });

  it("uses the provided fallback for empty/nullish errors", () => {
    expect(safeErrorMessage(null, "Custom fallback")).toBe("Custom fallback");
    expect(safeErrorMessage(undefined)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(safeErrorMessage({})).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("accepts string errors and objects with a message field", () => {
    expect(safeErrorMessage("forbidden")).toMatch(/permission/i);
    expect(safeErrorMessage({ message: "network down" })).toMatch(/reach the server/i);
  });
});

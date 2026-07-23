import { describe, it, expect } from "vitest";
import {
  validatePasswordChange,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/passwordPolicy";

/**
 * Unit tests for the shared password policy used by the forgot-password reset
 * flow (R-011). The policy is the pure, testable core; the server actions wrap it
 * around Supabase I/O (not exercised here — Supabase is never touched in tests).
 */
describe("validatePasswordChange", () => {
  it("accepts a valid matching password at the minimum length", () => {
    const pw = "a".repeat(PASSWORD_MIN_LENGTH);
    const result = validatePasswordChange({ password: pw, confirmPassword: pw });
    expect(result).toEqual({ ok: true, password: pw });
  });

  it("rejects a password shorter than the minimum", () => {
    const pw = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    const result = validatePasswordChange({ password: pw, confirmPassword: pw });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least/i);
  });

  it("rejects when the two passwords do not match", () => {
    const result = validatePasswordChange({
      password: "longenough1",
      confirmPassword: "longenough2",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not match/i);
  });

  it("rejects non-string input (e.g. missing form field) without throwing", () => {
    const result = validatePasswordChange({
      password: undefined,
      confirmPassword: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/required/i);
  });

  it("checks length before matching (short + mismatched → length error)", () => {
    const result = validatePasswordChange({
      password: "abc",
      confirmPassword: "xyz",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least/i);
  });
});

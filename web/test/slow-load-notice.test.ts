import { describe, it, expect } from "vitest";
import {
  SLOW_LOAD_MESSAGES,
  SLOW_LOAD_QUIET_MS,
  SLOW_LOAD_STEP_MS,
  slowLoadMessageAt,
  slowLoadNextChangeMs,
} from "@/app/(app)/dashboard/_platform/ui/slowLoadCopy";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { routing } from "@/i18n/routing";

/**
 * The "this is taking a while" notice.
 *
 * Two promises are being kept here, and they pull in opposite directions: a fast page must show
 * NOTHING (a spinner that flashes for a fifth of a second is worse than no spinner), and a slow
 * one must not sit in silence, because silence is what makes people click again.
 *
 * The third is honesty: the messages must never claim progress the code cannot observe, and the
 * last one has to be terminal rather than looping reassurances at somebody who has been waiting.
 */

describe("slow-load notice schedule", () => {
  it("says nothing at all while a page is still quick", () => {
    expect(slowLoadMessageAt(0)).toBeNull();
    expect(slowLoadMessageAt(500)).toBeNull();
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS - 1)).toBeNull();
  });

  it("speaks up at two seconds, which is the threshold that was asked for", () => {
    expect(SLOW_LOAD_QUIET_MS).toBe(2000);
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS)).toBe(SLOW_LOAD_MESSAGES[0]);
  });

  it("changes the line as the wait goes on", () => {
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS + SLOW_LOAD_STEP_MS)).toBe(SLOW_LOAD_MESSAGES[1]);
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS + SLOW_LOAD_STEP_MS * 2)).toBe(SLOW_LOAD_MESSAGES[2]);
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS + SLOW_LOAD_STEP_MS * 3)).toBe(SLOW_LOAD_MESSAGES[3]);
  });

  it("settles on the honest last message instead of cycling forever", () => {
    const last = SLOW_LOAD_MESSAGES[SLOW_LOAD_MESSAGES.length - 1];
    expect(slowLoadMessageAt(SLOW_LOAD_QUIET_MS + SLOW_LOAD_STEP_MS * 20)).toBe(last);
    expect(slowLoadMessageAt(10 * 60 * 1000)).toBe(last);
    // And nothing further is scheduled, so a long wait costs no more renders.
    expect(slowLoadNextChangeMs(SLOW_LOAD_QUIET_MS + SLOW_LOAD_STEP_MS * 20)).toBeNull();
  });

  it("wakes exactly when the line is due to change", () => {
    expect(slowLoadNextChangeMs(0)).toBe(SLOW_LOAD_QUIET_MS);
    expect(slowLoadNextChangeMs(1500)).toBe(500);
    expect(slowLoadNextChangeMs(SLOW_LOAD_QUIET_MS)).toBe(SLOW_LOAD_STEP_MS);
    expect(slowLoadNextChangeMs(SLOW_LOAD_QUIET_MS + 100)).toBe(SLOW_LOAD_STEP_MS - 100);
  });

  it("never promises progress it cannot see", () => {
    for (const message of SLOW_LOAD_MESSAGES) {
      expect(message).not.toMatch(/%|almost|nearly|\d+\s*(seconds?|minutes?) (left|remaining)/i);
    }
  });

  it("reads back in every language the dashboard ships", () => {
    for (const locale of routing.locales.filter((l) => l !== "en")) {
      const dictionary = getDashboardDictionary(locale);
      for (const message of SLOW_LOAD_MESSAGES) {
        expect(dictionary[message], `${locale}: ${message}`).toBeTruthy();
        expect(dictionary[message], `${locale}: ${message}`).not.toBe(message);
      }
    }
  });

  it("survives a nonsense clock rather than rendering garbage", () => {
    expect(slowLoadMessageAt(Number.NaN)).toBeNull();
    expect(slowLoadMessageAt(-1)).toBeNull();
    expect(slowLoadNextChangeMs(Number.NaN)).toBe(SLOW_LOAD_QUIET_MS);
    expect(slowLoadNextChangeMs(-5000)).toBe(SLOW_LOAD_QUIET_MS);
  });
});

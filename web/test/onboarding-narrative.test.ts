import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ONBOARDING_DIR = path.join(process.cwd(), "src", "app", "(app)", "onboarding");
const CLIENT = fs.readFileSync(path.join(ONBOARDING_DIR, "OnboardingClient.tsx"), "utf8");
const PAGE = fs.readFileSync(path.join(ONBOARDING_DIR, "page.tsx"), "utf8");

/**
 * ONBOARDING SAFETY CONTRACT (Phase 7).
 *
 * The onboarding redesign changed **narrative and UI only**. The step machine underneath is the
 * most fragile thing in the product: the UI step is the DB step MINUS ONE, steps only ever move
 * forward, the dashboard gate is `onboarding_step >= 6`, checkout activation is dual-path, and
 * provisioning resumes from partial state. Every one of those has bitten before.
 *
 * These tests are guardrails, not behaviour tests — they assert that the *shape* of the machine
 * is still present, so a future copy edit cannot quietly renumber a step or drop the gate.
 * Behaviour itself is exercised by the live funnel; this catches the class of mistake that a
 * re-skin actually makes.
 */
describe("onboarding step machine is intact", () => {
  it("still declares exactly six UI steps, ids 0-5", () => {
    const ids = [...CLIENT.matchAll(/\{\s*id:\s*(\d+),\s*label:/g)].map((m) => Number(m[1]));
    expect(ids).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("documents the UI-step = DB-step - 1 mapping where the steps are defined", () => {
    // The single most confusing thing in the codebase. If someone deletes this note while
    // editing labels, the next person renumbers a step and breaks the dashboard gate.
    expect(CLIENT).toMatch(/DB step mapping/);
    expect(CLIENT).toMatch(/MINUS ONE|step - 1|step minus one/i);
  });

  it("keeps every step's render branch (0 through 5)", () => {
    for (const step of [0, 1, 2, 3, 4, 5]) {
      expect(CLIENT).toContain(`currentStep === ${step}`);
    }
  });

  it("preserves the guard against deriving currentStep from state after mount", () => {
    // Re-deriving the step on re-render caused the wizard to bounce users backwards.
    expect(CLIENT).toMatch(/Do NOT derive currentStep from state\.onboardingStep after mount/);
  });

  it("still INVOKES every server action the funnel depends on", () => {
    // Asserting the import alone would be a false guarantee: `completeOnboarding` and
    // `saveOnboardingPreferences` are imported here but never called (activation itself raises
    // the step to 6, and "Go to dashboard" only navigates). So match a call site, not a symbol.
    for (const action of [
      "runActivation",
      "checkPhoneStatus",
      "advanceToPlanAction",
      "startPlanCheckout",
      "savePhonePreferences",
      "continueWithoutPlan",
    ]) {
      expect(CLIENT, `${action} is imported but never called`).toMatch(
        new RegExp(`(await\\s+)?${action}\\s*\\(`)
      );
    }
  });

  it("reaches the dashboard by navigation, because activation already set step 6", () => {
    // If this ever needs an explicit completeOnboarding() call, the gate semantics changed and
    // the note in skills/onboarding-flow.md must change with it.
    expect(CLIENT).toMatch(/activation already set onboarding_step = 6/i);
  });

  it("keeps the checkout-return handling that makes activation dual-path", () => {
    expect(CLIENT).toMatch(/checkoutStatus/);
    expect(PAGE).toMatch(/session_id|checkout/);
  });
});

/**
 * NARRATIVE CONTRACT.
 *
 * The approved framing is "let's build your AI team" — hiring an employee, not provisioning a
 * telephony line. These pin the framing so it cannot silently regress to the old vocabulary.
 */
describe("onboarding narrative", () => {
  it("frames the flow as building an AI team", () => {
    expect(CLIENT).toMatch(/build your <em[^>]*>AI team<\/em>/);
  });

  it("labels the finale as the employee starting work, not a line going live", () => {
    expect(CLIENT).toContain("Your AI employee starts now");
  });

  it("assembles the employee card only from decisions already made", () => {
    // The card must never render blank rows — a card of unknowns is worse than no card.
    expect(CLIENT).toMatch(/if \(rows\.length === 0\) return null/);
  });

  it("does not describe activation as independently-ticking progress it cannot back", () => {
    // The three setup rows share one state because the activation action returns one result.
    expect(CLIENT).toMatch(/not live per-step progress/);
  });
});

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
      "saveProductIntentAction",
      "startPlanCheckout",
      "startChatCheckout",
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

describe("a step is named in one place", () => {
  /**
   * Each step body used to open with a hardcoded eyebrow - "Step 1 · Your business" - repeating
   * the number and label the stepper rail already showed, highlighted, two columns to the left.
   * Four hand-written copies of data that lives in STEPS, free to drift from it the first time
   * someone renames a step.
   *
   * The rail is desktop-only, so the label did carry real information on a phone. It moved to the
   * mobile bar and is read from STEPS there, rather than being deleted outright.
   */
  it("no step body hardcodes its own number and label", () => {
    const offenders = [...CLIENT.matchAll(/>\s*Step \d+\s*·[^<]*</g)].map((m) => m[0].trim());
    expect(offenders).toEqual([]);
  });

  it("the mobile bar names the current step, reading it from STEPS", () => {
    // On a phone the stepper rail is hidden, so this line is the only thing naming the step.
    expect(CLIENT).toMatch(/STEPS\[currentStep\]\?\.label/);
  });

  it("the stepper rail still renders every step's label and description", () => {
    expect(CLIENT).toMatch(/STEPS\.map/);
    expect(CLIENT).toMatch(/\{step\.label\}/);
    expect(CLIENT).toMatch(/\{step\.desc\}/);
  });

  it("onboarding does not re-sell the product it has already sold", () => {
    // The rail carried the marketing pitch, so every screen had two headings and two paragraphs
    // before the first field. By this point the customer has bought.
    expect(CLIENT).not.toMatch(/answers every call, day or night/);
    // The welcome itself stays — this is a trim, not a stripping.
    expect(CLIENT).toMatch(/Let&apos;s build your/);
  });
});

/**
 * WHAT THE CUSTOMER ASKED FOR AT THE PHONE STEP — and what it must cost them.
 *
 * A customer clicked "I don't need a phone line — I want chat" and finished onboarding on a US
 * number, rented monthly. Nothing threw. Three separate things had to line up for it:
 *
 *  1. The answer was DISCARDED. The step wrote an area code and nothing else, so "no phone line"
 *     and "claim me a number in 415" left the workspace in identical states.
 *  2. The next screen led with three large cards priced $149/$399/$899 — phone plans — with chat
 *     underneath as a footnote. Selecting one is how a chat customer buys phone service.
 *  3. The wizard's own "is this a chat customer" test was `planCode === "chat_only"`, which went
 *     silently dead when that plan was retired, so the chat path stopped being taken at all.
 *
 * These are source-shape guards, like the rest of this file. They cannot prove a US number is not
 * bought — only a real signup does that — but each one pins the specific thing that was wrong, so
 * a future edit cannot restore it quietly.
 */
const ACTIONS = fs.readFileSync(path.join(ONBOARDING_DIR, "_actions.ts"), "utf8");

describe("the phone-step answer is recorded, and it decides what gets bought", () => {
  it("records the intent instead of only the area code", () => {
    // The voice branch's phone screen writes `new` or `byo`...
    expect(ACTIONS).toMatch(/phone_provisioning_mode:\s*mode/);
    // ...and every non-voice route writes `none` through one helper, rather than each remembering
    // to. The area code goes with it: a stale one is how a change of mind still buys a line.
    expect(ACTIONS).toMatch(/patch\.phone_provisioning_mode = extra\.phoneProvisioningMode/);
    expect(ACTIONS).toMatch(/=== "none"\) patch\.phone_desired_area_code = null/);
    expect(ACTIONS).toMatch(/phoneProvisioningMode: intent === "voice" \? undefined : "none"/);
  });

  it("does not carry a US area code over into a number we are not buying", () => {
    // A stale area code is how a change of mind still ends in a 415 line.
    expect(ACTIONS).toMatch(/mode === "new" && areaCode/);
  });

  it("activation reads the intent before it provisions anything", () => {
    const beforeProvision = ACTIONS.slice(0, ACTIONS.indexOf("// 2) Provision PSTN number"));
    expect(beforeProvision).toMatch(/phone_provisioning_mode/);
    // And the "customer owns their number" branch returns without claiming one.
    expect(beforeProvision).toMatch(/phoneMode === "byo"/);
  });

  it("decides chat-only by the absence of a voice plan, not by a retired plan code", () => {
    // `chat_only` was a $0 voice plan invented to mean "no voice". Comparing against it is a test
    // that can never be true again — and was, in both the action and the client, for a week.
    expect(ACTIONS).toMatch(/if \(!planState\.voicePlanCode\)/);
    // The declaration, not the word: the comment above it deliberately quotes the dead test to
    // explain what went wrong, and that account is worth keeping.
    expect(CLIENT).not.toMatch(/const isChatOnly = state\.planCode === "chat_only"/);
    expect(CLIENT).toMatch(/const isChatOnly = state\.isPlanActive && !state\.planCode/);
  });
});

/**
 * THE BRANCH. This is the guarantee the redesign rests on.
 *
 * A customer is charged for the product they picked and nothing else. Not "warned about" — never
 * SHOWN the other one's prices, so there is no wrong card on the screen to click. The plan step
 * used to carry three voice plans, the chat tiers and a skip link at once; the three large cards
 * are voice plans, so "the plans" read as phone service and a chat customer bought one (R-153).
 */
describe("each branch of the plan step sells only its own product", () => {
  it("asks which product first, on its own step, with nothing pre-selected", () => {
    // A default here would be a recommendation nobody made, on the one screen whose job is to
    // stop the product choosing for the customer.
    expect(CLIENT).toMatch(/useState<"voice" \| "chat" \| "free" \| null>\(\s*state\.productIntent \?\? null\s*\)/);
    expect(CLIENT).toMatch(/<SubmitButton disabled=\{!productChoice\}>/);
    expect(ACTIONS).toMatch(/export async function saveProductIntentAction/);
    // Submitting without an answer is refused rather than defaulted.
    expect(ACTIONS).toMatch(/Choose what your AI should answer/);
  });

  it("renders the voice plans and the chat tiers in mutually exclusive branches", () => {
    expect(CLIENT).toMatch(/planBranch === "voice" && voiceSubStep === "plans"/);
    expect(CLIENT).toMatch(/planBranch === "voice" && voiceSubStep === "phone"/);
    expect(CLIENT).toMatch(/\{planBranch === "chat" && \(/);
    expect(CLIENT).toMatch(/\{planBranch === "free" && \(/);
    // The voice cards live INSIDE the voice branch: `state.plans` must not be reachable from
    // anywhere a chat customer can stand.
    const voiceBranch = CLIENT.indexOf('planBranch === "voice" && voiceSubStep === "plans"');
    const voiceCards = CLIENT.indexOf("state.plans", voiceBranch);
    const chatBranch = CLIENT.indexOf('{planBranch === "chat" && (');
    expect(voiceBranch).toBeGreaterThan(-1);
    expect(voiceBranch).toBeLessThan(voiceCards);
    expect(voiceCards).toBeLessThan(chatBranch);
  });

  it("never sends a chat tier to the voice checkout, or a voice plan to the chat one", () => {
    // `startPlanCheckout` can sell both in one session. The voice branch passes null in so many
    // words, at the call site, rather than trusting that some piece of state was cleared.
    expect(CLIENT).toMatch(
      /startPlanCheckout\(selectedPlan as "starter" \| "growth" \| "scale", null\)/
    );
    expect(CLIENT).toMatch(/startChatCheckout\(selectedChat\)/);
  });

  it("asks for the number AFTER the plan, not before it", () => {
    // Asking about a phone line first is what made every signup a voice signup by default.
    expect(CLIENT).toMatch(/const \[voiceSubStep, setVoiceSubStep\] = useState<"plans" \| "phone">\("plans"\)/);
    // And the phone answer is saved before the card is charged — activation reads it, and Stripe's
    // webhook can land before the browser gets back here.
    const checkout = CLIENT.slice(
      CLIENT.indexOf("const startVoiceCheckout"),
      CLIENT.indexOf("const startChatOnlyCheckout")
    );
    expect(checkout).toContain("savePhonePreferences");
    expect(checkout.indexOf("savePhonePreferences")).toBeLessThan(checkout.indexOf("startPlanCheckout"));
  });

  it("lets the customer walk back out of a branch", () => {
    // Choosing a plan and then wanting a different one must not mean leaving the step and
    // re-answering the product question.
    expect(CLIENT).toMatch(/backTarget === "voice-plans"/);
    expect(CLIENT).toMatch(/setVoiceSubStep\("plans"\)/);
    expect(CLIENT).toMatch(/"Back to plans"/);
  });

  it("asks the question again rather than guessing for a workspace that never answered it", () => {
    // NULL intent is not a fourth branch. Guessing is the entire defect.
    expect(CLIENT).toMatch(/\{!planBranch && productChooser\}/);
  });

  it("never prices the other branch's leftover selection", () => {
    // Select a voice plan, press Back, switch to messages: `selectedPlan` still holds "growth".
    // Nothing wrong is bought — each branch passes only its own product — but a summary that added
    // both would tell the customer they were about to be charged for the plan they walked away
    // from. Found by walking the flow, not by reading it.
    expect(CLIENT).toMatch(/planBranch !== "chat" && selectedPlan/);
    expect(CLIENT).toMatch(/planBranch !== "voice" && selectedChat/);
    expect(CLIENT).toMatch(/\}, \[planBranch, selectedPlan, selectedChat/);
  });

  it("quotes prices from the catalogue the checkout charges from", () => {
    // A hardcoded "from $149" is a claim that goes stale silently, on the screen where a customer
    // decides what to buy.
    expect(CLIENT).toMatch(/Math\.min\(\.\.\.state\.plans\.map/);
    expect(CLIENT).toMatch(/Math\.min\(\.\.\.state\.chatPlans\.map/);
  });
});

describe("free preview finishes setup without buying anything", () => {
  it("is a real card, not a link at the bottom of a page of prices", () => {
    expect(CLIENT).toMatch(/id: "free"/);
    expect(CLIENT).toMatch(/Look around first/);
  });

  it("says plainly that nothing will answer yet", () => {
    // The honest version of a free tier is the part people otherwise find out later.
    expect(CLIENT).toMatch(/answer calls or messages until you choose a plan/);
  });

  it("spends nothing and still leaves an employee behind", () => {
    // Buying a chat tier from the billing page grants entitlement and creates no employee, so a
    // workspace that arrived without one would pay for chat and still answer nobody.
    const freeStart = ACTIONS.indexOf("export async function continueWithoutPlan");
    const nextExport = ACTIONS.indexOf("\nexport ", freeStart + 1);
    const free = ACTIONS.slice(freeStart, nextExport === -1 ? undefined : nextExport);
    expect(free).toMatch(/recordProductIntent\(orgId, "free"/);
    expect(free).toMatch(/ensureNonVoiceEmployee/);
    // The card that charges nothing must be unable to charge anything. Comments are stripped
    // first: this function's own prose says "no Vapi, no Stripe", and a test that reads its
    // documentation instead of its code proves nothing.
    const code = free.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(code).not.toMatch(/stripe/i);
    expect(code).not.toMatch(/vapi/i);
  });

  it("lands on the dashboard, not on a page about phone numbers", () => {
    expect(CLIENT).toMatch(/window\.location\.assign\("\/dashboard"\)/);
  });
});

/**
 * The last line of defence, behind the branch.
 *
 * The UI makes the wrong purchase unreachable; this makes the wrong PROVISION impossible. A
 * workspace whose owner chose messages or free never gets a phone line, whatever `org_plan_limits`
 * says — because if those two ever disagree, something is wrong, and the wrong thing to do is
 * quietly rent someone a US number.
 */
describe("activation refuses to provision against the customer's own answer", () => {
  it("treats a chat or free intent as a hard refusal, not a warning", () => {
    expect(ACTIONS).toMatch(/const declinedVoice = productIntent === "chat" \|\| productIntent === "free"/);
    expect(ACTIONS).toMatch(/if \(!planState\.voicePlanCode \|\| declinedVoice\)/);
    // And it is loud: this combination cannot come from the wizard, so it means a defect.
    expect(ACTIONS).toMatch(/INTENT_MISMATCH/);
    // The rule it replaced.
    expect(ACTIONS).not.toMatch(/provisioning anyway/);
  });

  it("reads an unanswered question as unanswered, never as a decline", () => {
    // Collapsing NULL onto one of the three values would apply the refusal to every workspace
    // that started before the column existed — a paying voice customer, denied the number.
    expect(ACTIONS).toMatch(/function toProductIntent[\s\S]{0,400}\? v\s*:\s*null/);
  });

  it("stamps the intent from what was actually bought, so the two cannot drift", () => {
    const planCheckout = ACTIONS.slice(
      ACTIONS.indexOf("export async function startPlanCheckout"),
      ACTIONS.indexOf("export async function startChatCheckout")
    );
    expect(planCheckout).toMatch(/recordProductIntent\(orgId, "voice"\)/);
    // ...and does NOT touch the phone mode, which was answered on the screen the button sits on.
    expect(planCheckout).not.toMatch(/recordProductIntent\(orgId, "voice", /);

    const chatCheckout = ACTIONS.slice(ACTIONS.indexOf("export async function startChatCheckout"));
    expect(chatCheckout).toMatch(/recordProductIntent\(orgId, "chat", \{ phoneProvisioningMode: "none" \}\)/);
  });

  it("never lowers the onboarding step when the phone answer is saved from inside the plan step", () => {
    // The phone question now saves from step 4. An unconditional write would pull a workspace back
    // to "choose a plan" after Stripe's webhook had already moved it to 5.
    const setter = ACTIONS.slice(ACTIONS.indexOf("export async function setOnboardingStepToPlan"));
    expect(setter).toMatch(/onboarding_step\.is\.null,onboarding_step\.lt\.4/);
  });
});

describe("connecting a number the customer already owns is offered, not advertised", () => {
  it("no longer ships a permanently disabled 'Later' card", () => {
    // The path behind it shipped and answered a real customer's calls while the card still said
    // "Later" — so a business whose number is printed on their van had to take a US one first.
    const laterBadges = [...CLIENT.matchAll(/>Later</g)];
    expect(laterBadges.length).toBeLessThanOrEqual(1);
    expect(CLIENT).toMatch(/state\.byoNumbersEnabled \?/);
  });

  it("is gated on the same flag as the API behind it", () => {
    // Rendered from the flag rather than shown unconditionally: an environment with the connect
    // route switched off must not offer a door that answers 404.
    expect(ACTIONS).toMatch(/byoNumbersEnabled\(\)/);
  });

  it("reuses the dashboard's connect flow rather than a second copy of it", () => {
    const dialog = fs.readFileSync(
      path.join(ONBOARDING_DIR, "_components", "ConnectOwnNumberDialog.tsx"),
      "utf8"
    );
    expect(dialog).toMatch(/dashboard\/channels\/phone-numbers\/_components\/ConnectOwnNumberFlow/);
  });
});

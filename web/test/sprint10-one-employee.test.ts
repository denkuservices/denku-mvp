import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The read model imports the service-role client at module load; only pure helpers are
// exercised here, so the client is stubbed rather than configured.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  EDITABLE_CONFIG_FIELDS,
  BUSINESS_CONTEXT_FIELDS,
  PRESETS,
  AGENT_TYPES,
  SETUP_LANGUAGES,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEZONE,
  EMPTY_BUSINESS_CONTEXT,
  normalizeEmphasisPoints,
  toBusinessContext,
  toSetupFormState,
  toUpdateAgentConfigPayload,
  presetMeta,
  defaultFirstMessage,
  type SetupFormState,
} from "@/app/(app)/dashboard/_platform/team/setupFields";
import { EMPLOYEE_TABS } from "@/app/(app)/dashboard/_platform/team/tabs";
import { allSettingsItems } from "@/app/(app)/dashboard/_platform/settings/nav";

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

const ACTIONS = "app/(app)/dashboard/settings/_actions/agents.ts";

/**
 * SPRINT 10 — "ONE EMPLOYEE" CONTRACT (R-094 remainder).
 *
 * Employee configuration had four doors: the Settings agent page, its Advanced page, the phone
 * line's Advanced tab (writing the same agent row through the same action), and a read-only
 * mirror on the employee itself. This sprint makes the employee the only one.
 *
 * The migration is a UI relocation, not a write-path redesign — so the tests that matter most
 * are the ones proving the payload and the guarantees did not change.
 */

// ---------------------------------------------------------------------------
// FIELD PARITY — the one unacceptable outcome is a writable field disappearing.
// ---------------------------------------------------------------------------
describe("field parity · the editor writes exactly what the action accepts", () => {
  it("every field in the action's schema is offered by the editor", () => {
    // Parse the zod object keys out of the server action rather than duplicating them here,
    // so drift on either side fails this test.
    const src = read(ACTIONS);
    const schema = src.match(/const UpdateAgentConfigSchema = z\.object\(\{([\s\S]*?)\n\}\);/);
    expect(schema, "UpdateAgentConfigSchema not found — did the action move?").toBeTruthy();

    const schemaKeys = [...schema![1].matchAll(/^\s{2}(\w+):/gm)]
      .map((m) => m[1])
      .filter((k) => k !== "agentId");

    expect([...schemaKeys].sort()).toEqual([...EDITABLE_CONFIG_FIELDS].sort());
  });

  it("the payload builder emits exactly those keys, plus agentId", () => {
    const state: SetupFormState = {
      language: "Spanish",
      timezone: "Europe/Istanbul",
      behaviorPresetId: "support",
      agentType: "support",
      firstMessage: "Hi there",
      emphasisPoints: ["be brief"],
      businessContext: { ...EMPTY_BUSINESS_CONTEXT, businessName: "Acme" },
    };
    const payload = toUpdateAgentConfigPayload("agent-1", state);
    expect(Object.keys(payload).sort()).toEqual(["agentId", ...EDITABLE_CONFIG_FIELDS].sort());
  });

  it("all eight business-context fields survive the move", () => {
    // These are the keys BusinessContextSchema validates in the action.
    const src = read(ACTIONS);
    const block = src.match(/const BusinessContextSchema = z\s*\n?\s*\.object\(\{([\s\S]*?)\n\s*\}\)/);
    expect(block, "BusinessContextSchema not found").toBeTruthy();
    const schemaKeys = [...block![1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);

    expect([...schemaKeys].sort()).toEqual([...BUSINESS_CONTEXT_FIELDS.map((f) => f.key)].sort());
    expect([...schemaKeys].sort()).toEqual([...Object.keys(EMPTY_BUSINESS_CONTEXT)].sort());
  });

  it("keeps every choice the replaced form offered", () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      "professional",
      "support",
      "concierge",
      "sales",
      "direct",
      "custom",
    ]);
    expect(AGENT_TYPES.map((t) => t.value)).toEqual(["support", "sales", "concierge", "general"]);
    expect([...SETUP_LANGUAGES]).toEqual(["English", "Spanish", "French", "German", "Turkish"]);
  });
});

// ---------------------------------------------------------------------------
// TRANSFORMATION PARITY — the collapse rules feed prompt derivation.
// ---------------------------------------------------------------------------
describe("transformation parity · the collapse rules are unchanged", () => {
  const base: SetupFormState = {
    language: DEFAULT_LANGUAGE,
    timezone: DEFAULT_TIMEZONE,
    behaviorPresetId: null,
    agentType: "",
    firstMessage: "",
    emphasisPoints: [],
    businessContext: EMPTY_BUSINESS_CONTEXT,
  };

  it('"English" and "UTC" mean unset and are sent as null', () => {
    const p = toUpdateAgentConfigPayload("a", base);
    expect(p.language).toBeNull();
    expect(p.timezone).toBeNull();
  });

  it("a non-default language or timezone is sent verbatim", () => {
    const p = toUpdateAgentConfigPayload("a", { ...base, language: "Spanish", timezone: "Europe/Istanbul" });
    expect(p.language).toBe("Spanish");
    expect(p.timezone).toBe("Europe/Istanbul");
  });

  it("empty strings collapse to null, never to an empty string", () => {
    const p = toUpdateAgentConfigPayload("a", base);
    expect(p.agent_type).toBeNull();
    expect(p.first_message).toBeNull();
    expect(p.behavior_preset).toBeNull();
  });

  it("an empty emphasis list is null, a populated one is the array", () => {
    expect(toUpdateAgentConfigPayload("a", base).emphasis_points).toBeNull();
    expect(toUpdateAgentConfigPayload("a", { ...base, emphasisPoints: ["x"] }).emphasis_points).toEqual(["x"]);
  });

  it("the preset is sent as its id, never its label", () => {
    const p = toUpdateAgentConfigPayload("a", { ...base, behaviorPresetId: "concierge" });
    expect(p.behavior_preset).toBe("concierge");
    expect(PRESETS.some((x) => x.label === p.behavior_preset)).toBe(false);
  });

  it("normalizes emphasis points from arrays, JSON strings and junk (legacy rows)", () => {
    expect(normalizeEmphasisPoints(null)).toEqual([]);
    expect(normalizeEmphasisPoints(["a", " b ", ""])).toEqual(["a", "b"]);
    expect(normalizeEmphasisPoints('["a","b"]')).toEqual(["a", "b"]);
    expect(normalizeEmphasisPoints("plain")).toEqual(["plain"]);
    expect(normalizeEmphasisPoints(42)).toEqual([]);
  });

  it("coerces a stored business_context blob without inventing fields", () => {
    expect(toBusinessContext({ businessName: "Acme", nope: 1 })).toEqual({
      ...EMPTY_BUSINESS_CONTEXT,
      businessName: "Acme",
    });
    expect(toBusinessContext(null)).toEqual(EMPTY_BUSINESS_CONTEXT);
  });

  it("round-trips a stored row back to the same payload", () => {
    const state = toSetupFormState({
      name: "Front Desk",
      language: "Spanish",
      timezone: "Europe/Istanbul",
      behaviorPreset: "sales",
      agentType: "sales",
      firstMessage: "Hola",
      emphasisPoints: ["be warm"],
      businessContext: { businessName: "Acme" },
    });
    expect(toUpdateAgentConfigPayload("a", state)).toEqual({
      agentId: "a",
      language: "Spanish",
      timezone: "Europe/Istanbul",
      behavior_preset: "sales",
      agent_type: "sales",
      first_message: "Hola",
      emphasis_points: ["be warm"],
      business_context: { ...EMPTY_BUSINESS_CONTEXT, businessName: "Acme" },
    });
  });

  it("pre-fills the same default greeting as the replaced form", () => {
    const state = toSetupFormState({
      name: "Front Desk",
      language: null,
      timezone: null,
      behaviorPreset: null,
      agentType: null,
      firstMessage: null,
      emphasisPoints: null,
      businessContext: null,
    });
    expect(state.firstMessage).toBe(defaultFirstMessage("Front Desk"));
    expect(state.firstMessage).toBe("Hello, thanks for calling Front Desk. How can I help you today?");
  });

  it("falls back to the first preset for an unknown id rather than throwing", () => {
    expect(presetMeta("nonsense").id).toBe("professional");
    expect(presetMeta(null).id).toBe("professional");
  });
});

// ---------------------------------------------------------------------------
// WRITE-PATH PRESERVATION — the migration must not touch the server actions.
// ---------------------------------------------------------------------------
describe("write paths are preserved exactly", () => {
  const actions = read(ACTIONS);

  it("both server actions still exist and still sync through the shared Vapi helper", () => {
    expect(actions).toMatch(/export async function updateAgentConfiguration/);
    expect(actions).toMatch(/export async function updateAgentPromptOverride/);
    expect(actions).toMatch(/ensureAssistantConfig/);
    expect(actions).toMatch(/deriveEffectivePrompt/);
  });

  it("the owner/admin gate and the paused-workspace gate are intact", () => {
    const gates = actions.match(/role !== "owner" && \w+\.role !== "admin"/g) ?? [];
    expect(gates.length).toBe(2); // one per action
    const paused = actions.match(/isWorkspacePaused/g) ?? [];
    expect(paused.length).toBeGreaterThanOrEqual(3); // import + one call per action
  });

  it("configuration save still does NOT mint a manifest revision (deferred, not silently added)", () => {
    // Revisions are minted at call time only. Sprint 10 deliberately leaves that alone; this
    // test exists so adding it here becomes a decision rather than an accident.
    expect(actions).not.toMatch(/ensureCurrentRevision/);
  });

  it("the phone-line API route is untouched and still delegates to the shared action", () => {
    const route = read("app/api/phone-lines/[lineId]/update-agent-config/route.ts");
    expect(route).toMatch(/updateAgentPromptOverride/);
  });

  it("the editors call the actions directly — no second write path was introduced", () => {
    const setup = read("app/(app)/dashboard/_platform/team/SetupForm.tsx");
    const knowledge = read("app/(app)/dashboard/_platform/team/KnowledgeForm.tsx");
    expect(setup).toMatch(/updateAgentConfiguration/);
    expect(setup).toMatch(/updateAgentPromptOverride/);
    expect(knowledge).toMatch(/updateAgentConfiguration/);
    for (const body of [setup, knowledge]) {
      expect(body).not.toMatch(/supabase|\.from\(["'`]agents/);
      expect(body).not.toMatch(/fetch\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// GUARANTEES CARRIED OVER TO THE NEW SURFACE
// ---------------------------------------------------------------------------
describe("the new editors keep the guarantees the old page had", () => {
  const setup = read("app/(app)/dashboard/_platform/team/SetupForm.tsx");
  const knowledge = read("app/(app)/dashboard/_platform/team/KnowledgeForm.tsx");

  it("a paused workspace disables saving on both editors", () => {
    for (const body of [setup, knowledge]) {
      expect(body).toMatch(/workspaceStatus/);
      expect(body).toMatch(/paused/);
    }
  });

  it("saving is disabled until something actually changed", () => {
    for (const body of [setup, knowledge]) {
      expect(body).toMatch(/isDirty/);
    }
  });

  it("the employee page resolves the workspace status and passes it in", () => {
    const page = read("app/(app)/dashboard/team/[employeeId]/page.tsx");
    expect(page).toMatch(/getWorkspaceStatus/);
    expect(page).toMatch(/workspaceStatus=\{/);
  });
});

// ---------------------------------------------------------------------------
// IA — ONE DOOR
// ---------------------------------------------------------------------------
describe("one door · employee configuration lives on the employee", () => {
  it("Setup and Knowledge are still the approved tabs", () => {
    expect([...EMPLOYEE_TABS]).toContain("setup");
    expect([...EMPLOYEE_TABS]).toContain("knowledge");
  });

  it("the employee page renders the editors, not read-only mirrors linking to Settings", () => {
    const page = readCode("app/(app)/dashboard/team/[employeeId]/page.tsx");
    expect(page).toMatch(/SetupForm/);
    expect(page).toMatch(/KnowledgeForm/);
    // The "Configure"/"Change setup" escape hatches into Settings are gone.
    expect(page).not.toMatch(/dashboard\/settings\/agents/);
  });

  it("the prompt override lives inside Setup, behind an Advanced disclosure", () => {
    expect(setupHasAdvancedDisclosure()).toBe(true);
  });

  function setupHasAdvancedDisclosure(): boolean {
    const body = read("app/(app)/dashboard/_platform/team/SetupForm.tsx");
    return /<details/.test(body) && /system_prompt_override/.test(body);
  }

  it("Settings → AI Employees points at AI Team", () => {
    const item = allSettingsItems().find((i) => /employee/i.test(i.label));
    expect(item?.href).toBe("/dashboard/team");
    expect(item?.external).toBe(true);
  });

  it("the old Settings agent routes redirect to the employee tabs", () => {
    const list = readCode("app/(app)/dashboard/settings/agents/page.tsx");
    const detail = readCode("app/(app)/dashboard/settings/agents/[agentId]/page.tsx");
    const advanced = readCode("app/(app)/dashboard/settings/agents/[agentId]/advanced/page.tsx");

    // Flag-aware: `/dashboard/team` 404s with the platform experience off, so each redirect
    // falls back to the legacy roster rather than forwarding into a dead end.
    expect(list).toMatch(/redirect\(/);
    expect(list).toMatch(/["'`]\/dashboard\/team["'`]/);
    expect(list).toMatch(/\/dashboard\/agents/);

    for (const body of [detail, advanced]) {
      expect(body).toMatch(/\/dashboard\/team\/\$\{agentId\}\?tab=setup/);
      expect(body).toMatch(/\/dashboard\/agents\/\$\{agentId\}/);
    }
  });

  it("the replaced Settings form components are gone", () => {
    expect(exists("app/(app)/dashboard/settings/agents/[agentId]/_components/AgentConfigurePage.tsx")).toBe(false);
    expect(exists("app/(app)/dashboard/settings/agents/[agentId]/advanced/_components/AgentAdvancedPage.tsx")).toBe(false);
  });

  it("the employee tab route still exists for those redirects to land on", () => {
    expect(routeExists("/dashboard/team/[employeeId]")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PHONE LINES — no longer an employee-config surface
// ---------------------------------------------------------------------------
describe("Phone Lines no longer edits the employee", () => {
  const advanced = readCode("app/(app)/dashboard/channels/phone-numbers/[lineId]/_tabs/AdvancedTab.tsx");

  it("the line's Advanced tab no longer writes the employee prompt", () => {
    expect(advanced).not.toMatch(/system_prompt_override/);
    expect(advanced).not.toMatch(/update-agent-config/);
  });

  it("it links to the employee's Setup instead of hiding the capability", () => {
    expect(advanced).toMatch(/\/dashboard\/team\//);
    expect(advanced).toMatch(/tab=setup/);
  });

  it("the fake disabled Limits controls are gone and were not replaced by invented ones", () => {
    expect(advanced).not.toMatch(/Maximum call duration/);
    expect(advanced).not.toMatch(/Silence timeout/);
    expect(advanced).not.toMatch(/Coming soon/);
  });

  it("the line's own greeting field is untouched — it is line config, not employee config", () => {
    const assigned = read("app/(app)/dashboard/channels/phone-numbers/[lineId]/_tabs/AssignedAITab.tsx");
    expect(assigned).toMatch(/first_message/);
  });
});

// ---------------------------------------------------------------------------
// TERMINOLOGY LEFTOVERS
// ---------------------------------------------------------------------------
describe("terminology", () => {
  it('no breadcrumb still reads "Agents"', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const body = readCode(path.relative(SRC, full));
          if (/label:\s*["'`]Agents["'`]/.test(body)) offenders.push(path.relative(SRC, full));
        }
      }
    };
    walk(path.join(SRC, "app"));
    expect(offenders).toEqual([]);
  });
});

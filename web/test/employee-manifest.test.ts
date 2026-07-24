import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  buildEmployeeManifest,
  manifestContentHash,
  stableStringify,
  validateManifest,
  type AgentRowForManifest,
} from "@/lib/platform/manifest/build";
import { MANIFEST_SCHEMA_VERSION, type EmployeeManifest } from "@/lib/platform/manifest/types";
import { ensureCurrentRevision } from "@/lib/platform/manifest/revisions";
import { makeFakeDb, type FakeDb } from "./helpers/fakePlatformDb";

const AGENT: AgentRowForManifest = {
  id: "emp-1",
  org_id: "o1",
  name: "Front Desk AI",
  language: "en",
  voice: "alloy",
  timezone: "America/New_York",
  first_message: "Hi, thanks for calling!",
  system_prompt_override: null,
  effective_system_prompt: "You are the front desk for Acme Dental…",
  router_persona_key: "router_en",
  default_persona_key: "support_en",
  business_context: { businessName: "Acme Dental", hours: "9-5" },
};

const RUNTIME = {
  brainProvider: "openai",
  brainModel: "gpt-4o",
  voiceProvider: "openai",
  voiceId: "alloy",
  transcriberProvider: "deepgram",
  transcriberModel: "nova-2",
  maxDurationSeconds: 900,
  silenceTimeoutSeconds: 30,
  toolRefs: ["tool-a", "tool-b"],
};

describe("manifest shape — the two audit rules", () => {
  const m = buildEmployeeManifest(AGENT, RUNTIME);

  it("captures the effective prompt that used to be silently overwritten (E-001)", () => {
    expect(m.personality.effectivePrompt).toBe("You are the front desk for Acme Dental…");
    expect(m.personality.personaKey).toBe("support_en");
  });

  it("records the provider binding so provenance is complete (E-002)", () => {
    expect(m.brain).toMatchObject({ provider: "openai", model: "gpt-4o" });
    expect(m.voice).toMatchObject({ provider: "openai", voiceId: "alloy", transcriberModel: "nova-2" });
    expect(m.voice?.maxDurationSeconds).toBe(900);
  });

  it("RULE 1 — contains no observed state (cost/KPIs/health are computed, not configured)", () => {
    for (const forbidden of ["cost", "kpis", "health", "metrics"]) {
      expect(m).not.toHaveProperty(forbidden);
    }
    expect(validateManifest({ ...m, cost: 12 } as unknown as EmployeeManifest).join(" ")).toMatch(/observed state/i);
  });

  it("RULE 2 — knowledge/tools are REFERENCES, not embedded copies", () => {
    expect(Array.isArray(m.knowledge.refs)).toBe(true);
    expect(Array.isArray(m.toolRefs)).toBe(true);
    expect(m.toolRefs).toEqual(["tool-a", "tool-b"]);
    // Transitional: today's per-employee blob is captured so revisions are complete (migrates to refs under R-109).
    expect(m.knowledge.inlineBusinessContext).toMatchObject({ businessName: "Acme Dental" });
  });

  it("declares its schema version so old revisions stay readable", () => {
    expect(m.schemaVersion).toBe(MANIFEST_SCHEMA_VERSION);
  });

  it("validates required identity/brain fields", () => {
    expect(validateManifest(m)).toEqual([]);
    const bad = buildEmployeeManifest({ ...AGENT, name: "  " }, RUNTIME);
    expect(validateManifest(bad).join(" ")).toMatch(/identity.name/);
  });
});

describe("content hashing — no revision churn on no-op saves", () => {
  it("is deterministic regardless of key insertion order", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 4, c: 3 }] })).toBe(stableStringify({ a: [2, { c: 3, d: 4 }], b: 1 }));
  });

  it("identical config hashes identically; a real change does not", () => {
    const a = manifestContentHash(buildEmployeeManifest(AGENT, RUNTIME));
    const b = manifestContentHash(buildEmployeeManifest({ ...AGENT }, { ...RUNTIME }));
    expect(a).toBe(b);

    const changed = manifestContentHash(
      buildEmployeeManifest({ ...AGENT, effective_system_prompt: "different prompt" }, RUNTIME)
    );
    expect(changed).not.toBe(a);
  });
});

describe("ensureCurrentRevision — idempotent, append-only, fail-safe", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = makeFakeDb();
    db.tables.agents = [{ ...AGENT }];
    db.tables.employee_manifests = [];
  });

  it("mints revision 1, then reuses it while config is unchanged", async () => {
    const first = await ensureCurrentRevision("emp-1", { reason: "call handled" }, db as any);
    expect(first).toBeTruthy();
    expect(db.tables.employee_manifests).toHaveLength(1);
    expect(db.tables.employee_manifests[0].revision).toBe(1);

    const second = await ensureCurrentRevision("emp-1", {}, db as any);
    expect(second).toBe(first);
    expect(db.tables.employee_manifests).toHaveLength(1); // no churn
  });

  it("mints a NEW revision when the employee's config actually changes", async () => {
    const r1 = await ensureCurrentRevision("emp-1", {}, db as any);
    db.tables.agents[0].effective_system_prompt = "You are now a billing specialist…";
    const r2 = await ensureCurrentRevision("emp-1", { reason: "prompt updated" }, db as any);

    expect(r2).not.toBe(r1);
    expect(db.tables.employee_manifests).toHaveLength(2);
    expect(db.tables.employee_manifests.map((r: any) => r.revision).sort()).toEqual([1, 2]);
    // Revision 1 is untouched — history is preserved, not overwritten. THE point of R-107.
    const rev1 = db.tables.employee_manifests.find((r: any) => r.revision === 1);
    expect(rev1.manifest.personality.effectivePrompt).toBe("You are the front desk for Acme Dental…");
  });

  it("returns null (never throws) for an unknown employee", async () => {
    expect(await ensureCurrentRevision("nope", {}, db as any)).toBeNull();
    expect(await ensureCurrentRevision("", {}, db as any)).toBeNull();
  });

  it("is INERT when the migration isn't applied — the voice path is unaffected", async () => {
    const stub = {
      from: (t: string) =>
        t === "agents"
          ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: AGENT, error: null }) }) }) }
          : {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () =>
                      Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "employee_manifests" does not exist' } }),
                  }),
                }),
              }),
            },
    };
    expect(await ensureCurrentRevision("emp-1", {}, stub as any)).toBeNull();
  });
});

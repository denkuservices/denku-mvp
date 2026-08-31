import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Two helpers that decide things a customer never sees until they go wrong: which employee a
 * newly connected channel answers with, and whether the AI is allowed to draft a business
 * profile at all.
 *
 * The drafting guard matters most. Everything written into Knowledge is spoken to customers as
 * the business's own word, so drafting from nothing is not a poor suggestion — it is a machine
 * inventing facts that a business will be quoted on.
 */

type Row = Record<string, unknown>;

let mainAgentId: string | null = null;
let agentsById: Row[] = [];
let oldestAgent: Row | null = null;
let businessDescription: string | null = null;
let existingContext: Row | null = null;
let llmKey: string | undefined;

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.order = self;
      chain.limit = self;
      chain.eq = (col: string, val: unknown) => {
        if (table === "agents" && col === "id") {
          chain.__byId = agentsById.find((a) => a.id === val) ?? null;
        }
        return chain;
      };
      chain.maybeSingle = () => {
        if (table === "organization_settings") {
          return Promise.resolve({
            data: {
              main_agent_id: mainAgentId,
              business_description: businessDescription,
              onboarding_goal: "support",
              onboarding_language: "en",
            },
            error: null,
          });
        }
        if (table === "orgs") return Promise.resolve({ data: { name: "Deneme" }, error: null });
        if (table === "agents") {
          const byId = chain.__byId as Row | null | undefined;
          if (byId !== undefined) return Promise.resolve({ data: byId, error: null });
          return Promise.resolve({ data: oldestAgent, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      };
      chain.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r);
      return chain;
    },
  },
}));

vi.mock("@/lib/llm/provider", () => ({
  resolveLlmProvider: () => (llmKey ? { id: "openai", apiKey: llmKey, model: "gpt-4o-mini" } : null),
}));

import { defaultEmployeeIdForOrg } from "@/lib/platform/defaultEmployee";
import { draftKnowledgeForOrg } from "@/lib/platform/knowledgeDraft";

beforeEach(() => {
  mainAgentId = null;
  agentsById = [];
  oldestAgent = null;
  businessDescription = null;
  existingContext = null;
  llmKey = "sk-test";
});

describe("defaultEmployeeIdForOrg", () => {
  it("prefers the workspace's main employee", async () => {
    mainAgentId = "main-1";
    agentsById = [{ id: "main-1" }];
    expect(await defaultEmployeeIdForOrg("org-1")).toBe("main-1");
  });

  it("falls back to the oldest employee when there is no main one", async () => {
    oldestAgent = { id: "old-1" };
    expect(await defaultEmployeeIdForOrg("org-1")).toBe("old-1");
  });

  it("ignores a main_agent_id pointing at an employee that no longer exists", async () => {
    // A stale pointer would assign the channel to nothing: it looks assigned and answers nobody.
    mainAgentId = "deleted-1";
    agentsById = [];
    oldestAgent = { id: "old-1" };
    expect(await defaultEmployeeIdForOrg("org-1")).toBe("old-1");
  });

  it("returns null for a workspace with no employees at all", async () => {
    expect(await defaultEmployeeIdForOrg("org-1")).toBeNull();
  });

  it("returns null without an org rather than guessing", async () => {
    expect(await defaultEmployeeIdForOrg("")).toBeNull();
  });
});

describe("draftKnowledgeForOrg — the guard against inventing", () => {
  it("refuses to draft when the business has said nothing about itself", async () => {
    // The important case. With no description and no recorded services there is nothing to
    // rephrase, so anything produced would be invention presented as the business's own word.
    businessDescription = null;
    existingContext = null;
    const r = await draftKnowledgeForOrg("org-1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/nothing to draft from/i);
  });

  it("refuses when no model is configured, instead of failing silently", async () => {
    llmKey = undefined;
    businessDescription = "We are a dental clinic in Kadıköy.";
    const r = await draftKnowledgeForOrg("org-1");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/not configured/i);
  });

  it("refuses without an org", async () => {
    const r = await draftKnowledgeForOrg("");
    expect(r.ok).toBe(false);
  });
});

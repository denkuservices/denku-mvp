import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/commerce/tools", () => ({
  COMMERCE_TOOL_DEFINITIONS: [],
  COMMERCE_TOOL_NAMES: new Set<string>(),
  executeCommerceTool: vi.fn(),
  hasCommerceTools: vi.fn(async () => false),
}));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { makeChain } from "./helpers/supabaseMock";
import {
  DENKU_KNOWLEDGE_TOOL_NAME,
  denkuKnowledgeToolDefinition,
  isDenkuSelfOrg,
} from "@/lib/denku-agent/tools";
import { CORPUS_IDS } from "@/lib/denku-agent/corpus";
import { DENKU_TOOL_IDS } from "@/lib/vapi/assistantConfig";
import { toolDefinitionsFor, executeTool } from "@/lib/platform/reply/tools";

/**
 * Who may ask Denku's assistant about Denku.
 *
 * The tool reads no tenant data — the corpus is Denku's own public marketing and technical facts
 * — so the risk it carries is not a leak. It is that a plumber's AI, handed a tool it was never
 * meant to have, starts quoting Denku's pricing to the plumber's callers. That is one line of
 * configuration away at all times, because `ensureAssistantConfig` merges `DENKU_TOOL_IDS` into
 * EVERY assistant, so the tests below pin both the identity check and the fact that this tool
 * stays out of that list.
 */

const SELF = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

const from = supabaseAdmin.from as unknown as Mock;
const originalSelf = process.env.DENKU_SELF_ORG_ID;

beforeEach(() => {
  from.mockReset();
  process.env.DENKU_SELF_ORG_ID = SELF;
});

afterEach(() => {
  if (originalSelf === undefined) delete process.env.DENKU_SELF_ORG_ID;
  else process.env.DENKU_SELF_ORG_ID = originalSelf;
});

describe("workspace identity", () => {
  it("recognises Denku's own workspace", () => {
    expect(isDenkuSelfOrg(SELF)).toBe(true);
  });

  it("is false for every other workspace", () => {
    expect(isDenkuSelfOrg(OTHER)).toBe(false);
    expect(isDenkuSelfOrg(null)).toBe(false);
    expect(isDenkuSelfOrg(undefined)).toBe(false);
    expect(isDenkuSelfOrg("")).toBe(false);
  });

  it("fails CLOSED when the env var is unset — no workspace is Denku", () => {
    // An unset variable in a new environment must not make every workspace Denku's.
    delete process.env.DENKU_SELF_ORG_ID;
    expect(isDenkuSelfOrg(SELF)).toBe(false);
    expect(isDenkuSelfOrg(OTHER)).toBe(false);
  });
});

describe("the tool is never merged into every assistant", () => {
  it("stays out of DENKU_TOOL_IDS", () => {
    // `ensureAssistantConfig` merges that list into every assistant on every config path. A
    // Vapi tool id added there would hand this to every customer at once. If this test fails,
    // someone has done exactly that.
    const definition = denkuKnowledgeToolDefinition();
    expect(definition.function.name).toBe(DENKU_KNOWLEDGE_TOOL_NAME);
    // Nothing in the shared list may be this tool. The ids are opaque, so what is asserted is
    // the count: four tools belong to every assistant, and this is not one of them.
    expect(DENKU_TOOL_IDS).toHaveLength(4);
  });
});

describe("chat tool exposure", () => {
  it("offers the knowledge tool to Denku's own workspace", async () => {
    const tools = await toolDefinitionsFor(SELF);
    expect(tools.map((t) => t.function.name)).toContain(DENKU_KNOWLEDGE_TOOL_NAME);
  });

  it("does NOT offer it to any other workspace", async () => {
    const tools = await toolDefinitionsFor(OTHER);
    expect(tools.map((t) => t.function.name)).not.toContain(DENKU_KNOWLEDGE_TOOL_NAME);
  });

  it("still gives every workspace its booking and handover tools", async () => {
    // The regression that would matter most: a change to tool exposure must not cost a customer
    // the two things their AI is actually for.
    const names = (await toolDefinitionsFor(OTHER)).map((t) => t.function.name);
    expect(names).toContain("create_appointment");
    expect(names).toContain("create_ticket");
  });
});

describe("chat tool execution", () => {
  it("refuses the tool for a workspace that is not Denku, even if the model names it", async () => {
    // A model can call a tool it was never offered. `toolDefinitionsFor` is a hint; this is the
    // layer that actually runs, so the identity check is repeated rather than assumed.
    const out = await executeTool(
      DENKU_KNOWLEDGE_TOOL_NAME,
      { topic: "pricing-voice" },
      { orgId: OTHER, conversationId: "c1", contactId: null, employee: {} as never },
    );
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/Unknown tool/);
  });

  it("answers for Denku's own workspace", async () => {
    from.mockImplementation(() => makeChain({ data: [], error: null }));
    const out = await executeTool(
      DENKU_KNOWLEDGE_TOOL_NAME,
      { topic: "bring-your-own-number" },
      { orgId: SELF, conversationId: "c1", contactId: null, employee: {} as never },
    );
    expect(out.ok).toBe(true);
    expect(out.message).toMatch(/IPv4/);
  });

  it("never throws into a live conversation when the catalogue read fails", async () => {
    // Prices are a fact about Denku. A failed read must produce a chunk without prices, not an
    // exception that kills the reply — and never an invented number.
    from.mockImplementation(() => {
      throw new Error("db down");
    });
    const out = await executeTool(
      DENKU_KNOWLEDGE_TOOL_NAME,
      { topic: "what-denku-is" },
      { orgId: SELF, conversationId: "c1", contactId: null, employee: {} as never },
    );
    expect(out.ok).toBe(true);
    expect(out.message.length).toBeGreaterThan(50);
  });
});

describe("tool definition", () => {
  const def = denkuKnowledgeToolDefinition();

  it("enumerates every corpus topic, so the model chooses rather than guesses", () => {
    const params = def.function.parameters as {
      properties: { topic: { enum: string[] } };
    };
    expect(params.properties.topic.enum).toEqual([...CORPUS_IDS]);
  });

  it("requires nothing, because a half-formed question is still answerable", () => {
    const params = def.function.parameters as { required?: string[] };
    expect(params.required ?? []).toEqual([]);
  });

  it("tells the model to prefer the lookup over its own memory", () => {
    expect(def.function.description).toMatch(/rather than answering from memory/);
  });
});

/**
 * Create (or update) Denku's OWN assistant and its knowledge tool in the Vapi account.
 *
 *   npx vite-node --config vitest.config.ts scripts/register-denku-agent.mts
 *   npx vite-node --config vitest.config.ts scripts/register-denku-agent.mts --dry-run
 *
 * A script rather than a one-off curl, for the reason `verify-vapi-voices.mts` is one: the
 * assistant's system prompt is generated from the registries, so it goes stale the moment a
 * channel flips or a price changes. Re-running this is how it is refreshed, and the diff is
 * reviewable. A hand-typed prompt in a dashboard is precisely what this whole feature exists to
 * replace — it would be absurd to install it by hand.
 *
 * **It never touches a customer's assistant.** It matches by NAME on the two objects it owns and
 * creates them if absent. Everything else in the account is read-only to this script, and the
 * three customer assistants are not read at all.
 *
 * What it needs in the environment: `VAPI_API_KEY`, `DENKU_TOOL_SECRET`, and
 * `VAPI_WEBHOOK_BASE_URL` (or `NEXT_PUBLIC_SITE_URL`) for the tool + webhook URLs. It refuses a
 * localhost URL outright — an assistant configured from a dev machine that then answers a real
 * visitor is a bug this repo has already shipped once (R-077).
 */

import { CORPUS } from "../src/lib/denku-agent/corpus";
import { DENKU_KNOWLEDGE_TOOL_NAME } from "../src/lib/denku-agent/tools";
import { buildDenkuCorePrompt } from "../src/lib/denku-agent/corePrompt";
import { voicePlanFacts, addonFacts, type PlanRow, type AddonRow } from "../src/lib/denku-agent/facts";
import { DENKU_TOOL_IDS, resolveVoice, resolveTranscriber, CALL_MAX_DURATION_SECONDS, CALL_SILENCE_TIMEOUT_SECONDS } from "../src/lib/vapi/assistantConfig";

const DRY = process.argv.includes("--dry-run");

const ASSISTANT_NAME = "Denku — own assistant";
const VAPI = "https://api.vapi.ai";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`\n  Missing ${name}. Set it in web/.env.local and re-run.\n`);
    process.exit(1);
  }
  return v;
}

/**
 * The public base URL, refused if it is a dev machine.
 *
 * R-077: live assistants once carried `serverUrl = http://localhost:3000/api/tools` because they
 * were activated from someone's laptop. Every tool call from every real caller went nowhere, and
 * nothing reported it.
 */
function publicBaseUrl(): string {
  const raw = (process.env.VAPI_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) {
    console.error("\n  Set VAPI_WEBHOOK_BASE_URL (or NEXT_PUBLIC_SITE_URL) to the public site URL.\n");
    process.exit(1);
  }
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(raw)) {
    console.error(`\n  Refusing a local URL (${raw}). A live assistant would call it and reach nothing.\n`);
    process.exit(1);
  }
  return raw.replace(/\/+$/, "");
}

async function vapi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${VAPI}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${required("VAPI_API_KEY")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/**
 * The catalogue, read from the API rather than the database.
 *
 * This script runs outside Next, so it has no service-role client. The prices it bakes into the
 * prompt are a snapshot; the LIVE prices reach the assistant through the tool at call time, which
 * reads the catalogue itself. If the two ever disagree the tool wins, which is the right way
 * round — re-run this script to refresh the snapshot.
 */
const PLAN_SNAPSHOT: PlanRow[] = [
  { plan_code: "starter", display_name: "Starter", monthly_fee_usd: 149, included_minutes: 400, overage_rate_usd_per_min: 0.22, concurrency_limit: 1, included_phone_numbers: 1 },
  { plan_code: "growth", display_name: "Growth", monthly_fee_usd: 399, included_minutes: 1200, overage_rate_usd_per_min: 0.18, concurrency_limit: 4, included_phone_numbers: 1 },
  { plan_code: "scale", display_name: "Scale", monthly_fee_usd: 899, included_minutes: 3600, overage_rate_usd_per_min: 0.13, concurrency_limit: 10, included_phone_numbers: 1 },
];

const ADDON_SNAPSHOT: AddonRow[] = [
  { addon_key: "extra_phone", label: "Extra phone number", price_usd_month: 10 },
  { addon_key: "extra_concurrency", label: "Extra concurrent calls", price_usd_month: 99 },
  { addon_key: "chat_basic", label: "Chat — 1 channel", price_usd_month: 299 },
  { addon_key: "chat_standard", label: "Chat — 2 channels", price_usd_month: 499 },
];

type VapiTool = { id: string; name?: string; function?: { name?: string } };
type VapiAssistant = { id: string; name?: string };

function toolBody() {
  const base = publicBaseUrl();
  return {
    type: "apiRequest",
    name: DENKU_KNOWLEDGE_TOOL_NAME,
    function: {
      name: DENKU_KNOWLEDGE_TOOL_NAME,
      description:
        "Look up what is true about Denku — pricing, channels, languages, technical requirements, " +
        "security, how something works, or what happens after a call. Call this before answering " +
        "any specific question about Denku instead of answering from memory. Pick the `topic` that " +
        "best matches what the visitor asked. Summarise the answer in your own words; do not read " +
        `it out as written. Topics: ${CORPUS.map((c) => `${c.id} (${c.title})`).join("; ")}`,
    },
    // Non-blocking start message: the lookup is fast, and a blocking filler on every product
    // question makes the assistant sound like it is stalling.
    messages: [{ type: "request-start", blocking: false }],
    async: false,
    url: `${base}/api/tools/search-denku`,
    method: "POST",
    headers: {
      type: "object",
      properties: {
        "Content-Type": { type: "string", value: "application/json" },
        "x-denku-secret": { type: "string", value: required("DENKU_TOOL_SECRET") },
        // Both identity headers, for the same reason find_product carries them: the call row may
        // not exist yet in the first seconds, and the assistant id is true from connect.
        "x-vapi-call-id": { type: "string", value: "{{call.id}}" },
        "x-vapi-assistant-id": { type: "string", value: "{{assistant.id}}" },
      },
    },
    body: {
      type: "object",
      required: [],
      properties: {
        topic: {
          type: "string",
          description: "The topic id that best matches the question. Choose from the list in the description.",
          default: "",
        },
        question: {
          type: "string",
          description: "What the visitor asked, in their own words. Use when no topic fits well.",
          default: "",
        },
      },
    },
  };
}

function assistantBody(knowledgeToolId: string) {
  const base = publicBaseUrl();
  const prompt = buildDenkuCorePrompt({
    plans: voicePlanFacts(PLAN_SNAPSHOT),
    addons: addonFacts(ADDON_SNAPSHOT),
    surface: "a phone call from Denku's own website",
    spoken: true,
  });

  return {
    name: ASSISTANT_NAME,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }],
      /**
       * The four shared tools plus the knowledge lookup.
       *
       * The shared four are here so a prospect who leaves their details becomes a real ticket in
       * Denku's own Inbox — Denku is its own customer, so its enquiries should arrive the way a
       * customer's do. `find_product` comes along with them and is harmless: Denku has no store,
       * so it answers "could not check", and no visitor asks Denku for stock.
       */
      toolIds: [...DENKU_TOOL_IDS, knowledgeToolId],
    },
    voice: resolveVoice("en"),
    transcriber: resolveTranscriber("en"),
    server: { url: `${base}/api/webhooks/vapi` },
    maxDurationSeconds: CALL_MAX_DURATION_SECONDS,
    silenceTimeoutSeconds: CALL_SILENCE_TIMEOUT_SECONDS,
  };
}

async function main() {
  console.log(`\nDenku assistant registration${DRY ? " (dry run — nothing is written)" : ""}\n`);

  // ── Tool ───────────────────────────────────────────────────────────────────────────────────
  const tools = await vapi<VapiTool[]>("/tool?limit=100");
  const existingTool = tools.find(
    (t) => t.function?.name === DENKU_KNOWLEDGE_TOOL_NAME || t.name === DENKU_KNOWLEDGE_TOOL_NAME,
  );

  let toolId: string;
  if (existingTool) {
    toolId = existingTool.id;
    console.log(`  tool      ${DENKU_KNOWLEDGE_TOOL_NAME} → exists (${toolId})`);
    if (!DRY) {
      // PATCH cannot change `type`, so only the mutable half is sent.
      const { type: _type, ...patch } = toolBody() as Record<string, unknown>;
      await vapi(`/tool/${toolId}`, { method: "PATCH", body: JSON.stringify(patch) });
      console.log("            updated (description, url, headers, body)");
    }
  } else if (DRY) {
    toolId = "<would-be-created>";
    console.log(`  tool      ${DENKU_KNOWLEDGE_TOOL_NAME} → would CREATE`);
  } else {
    const created = await vapi<VapiTool>("/tool", { method: "POST", body: JSON.stringify(toolBody()) });
    toolId = created.id;
    console.log(`  tool      ${DENKU_KNOWLEDGE_TOOL_NAME} → CREATED ${toolId}`);
  }

  // ── Assistant ──────────────────────────────────────────────────────────────────────────────
  const assistants = await vapi<VapiAssistant[]>("/assistant?limit=100");
  const existing = assistants.find((a) => a.name === ASSISTANT_NAME);
  const body = assistantBody(toolId);

  let assistantId: string;
  if (existing) {
    assistantId = existing.id;
    console.log(`  assistant ${ASSISTANT_NAME} → exists (${assistantId})`);
    if (!DRY) {
      await vapi(`/assistant/${assistantId}`, { method: "PATCH", body: JSON.stringify(body) });
      console.log("            updated (prompt regenerated from the registries)");
    }
  } else if (DRY) {
    assistantId = "<would-be-created>";
    console.log(`  assistant ${ASSISTANT_NAME} → would CREATE`);
  } else {
    const created = await vapi<VapiAssistant>("/assistant", { method: "POST", body: JSON.stringify(body) });
    assistantId = created.id;
    console.log(`  assistant ${ASSISTANT_NAME} → CREATED ${assistantId}`);
  }

  console.log(`\n  system prompt: ${body.model.messages[0].content.length} chars`);
  console.log(`  tools on it:   ${body.model.toolIds.length}`);
  console.log(`\n  VAPI_DENKU_ASSISTANT_ID=${assistantId}\n`);
}

main().catch((err) => {
  console.error("\n  FAILED:", err instanceof Error ? err.message : String(err), "\n");
  process.exit(1);
});

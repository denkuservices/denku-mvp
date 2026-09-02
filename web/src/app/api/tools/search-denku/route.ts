import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeDenkuKnowledge, isDenkuSelfOrg } from "@/lib/denku-agent/tools";

export const dynamic = "force-dynamic";

/**
 * The voice transport for `search_denku_knowledge`.
 *
 * Vapi calls this mid-call with the shared secret every other tool route uses. Like
 * `find-product`, it is a thin transport around a shared executor rather than a second copy of
 * the logic — a visitor asking the same question on the phone and in the website widget has to
 * get the same answer.
 *
 * Three things are deliberately different from every other tool route here, and each has a
 * reason worth keeping.
 *
 * **1. It answers without an org.** Every other tool route refuses when it cannot resolve a
 * workspace, because it is about to read that workspace's data. This one reads nothing
 * tenant-scoped: the corpus is Denku's own public marketing and technical facts, the same for
 * every caller. And the caller it exists for is an anonymous visitor on the landing page, in the
 * first ten seconds, before any `calls` row exists. Refusing until a workspace resolves would
 * make the tool useless exactly when it is needed.
 *
 * **2. It refuses a workspace that is not Denku.** Serving without an org is not the same as
 * serving anyone. If an org DOES resolve and `DENKU_SELF_ORG_ID` is set and they differ, the tool
 * was attached to a customer's assistant by mistake — a plumber's AI about to discuss Denku's
 * pricing with the plumber's callers. That is a configuration error, so it is refused loudly
 * rather than answered.
 *
 * **3. It is not in `DENKU_TOOL_IDS`.** That list is merged into EVERY assistant by
 * `ensureAssistantConfig`. Adding this tool there would cause the mis-attachment that (2)
 * defends against, on every workspace at once. It is attached to Denku's own assistant alone.
 *
 * Answers 200 with `{ ok, result }` even for a miss: on a phone call "I do not want to give you a
 * wrong answer" is a sentence the assistant should speak, and a non-2xx makes Vapi say something
 * generic instead. A 401 is the one real failure, and it must not look like success — that is the
 * `create_ticket` lesson, where a tool failed validation on every real call for months while
 * tickets kept appearing from elsewhere.
 */

const RequestSchema = z.object({
  topic: z.string().max(120).optional(),
  question: z.string().max(400).optional(),
  /** Accepted if present, but the header is the trusted source. */
  call_id: z.string().max(120).optional(),
});

function authorized(request: NextRequest): boolean {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return false;
  const incoming = request.headers.get("x-denku-secret");
  return Boolean(incoming) && incoming === expected;
}

/** Vapi sends the literal "{{call.id}}" when a template fails to resolve — never query on that. */
function headerValue(request: NextRequest, name: string, fallback?: string): string | null {
  const raw = (request.headers.get(name) ?? "").trim() || (fallback ?? "").trim();
  if (!raw || raw.includes("{{")) return null;
  return raw;
}

/**
 * Best-effort workspace resolution, used only to catch a mis-attachment.
 *
 * Never read from the body: anyone holding the shared secret could then name a workspace. Both
 * paths key on something Vapi asserts in a header.
 */
async function resolveOrg(callId: string | null, assistantId: string | null): Promise<string | null> {
  if (callId) {
    try {
      const { data } = await supabaseAdmin
        .from("calls")
        .select("org_id")
        .or(`id.eq.${callId},vapi_call_id.eq.${callId}`)
        .limit(1)
        .maybeSingle<{ org_id: string }>();
      if (data?.org_id) return data.org_id;
    } catch {
      /* fall through to the assistant */
    }
  }

  if (assistantId) {
    try {
      const { data } = await supabaseAdmin
        .from("agents")
        .select("org_id")
        .eq("vapi_assistant_id", assistantId)
        .limit(1)
        .maybeSingle<{ org_id: string }>();
      if (data?.org_id) return data.org_id;
    } catch {
      /* nothing left to try */
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    console.warn("[TOOL][SEARCH_DENKU][UNAUTHORIZED]");
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_FAILED" } });
  }

  const callId = headerValue(request, "x-vapi-call-id", parsed.data.call_id);
  const assistantId = headerValue(request, "x-vapi-assistant-id");

  // Only to catch a mis-attachment — see (2) in the header comment. An unresolved org is normal
  // and is served, because the landing-page visitor has no workspace.
  const orgId = await resolveOrg(callId, assistantId);
  const selfConfigured = Boolean(process.env.DENKU_SELF_ORG_ID?.trim());
  if (orgId && selfConfigured && !isDenkuSelfOrg(orgId)) {
    console.warn("[TOOL][SEARCH_DENKU][WRONG_WORKSPACE]", {
      org_id: orgId,
      assistant_id: assistantId,
    });
    return NextResponse.json({
      ok: false,
      result:
        "This tool is not available on this assistant. Answer from what you know about the " +
        "business you work for, and do not discuss Denku.",
    });
  }

  console.info("[TOOL_CALLED]", {
    tool: "search_denku_knowledge",
    topic: parsed.data.topic ?? null,
    call_id: callId,
  });

  const result = await executeDenkuKnowledge({
    topic: parsed.data.topic,
    question: parsed.data.question,
  });

  console.info("[TOOL_RESULT]", {
    tool: "search_denku_knowledge",
    call_id: callId,
    chars: result.length,
  });

  return NextResponse.json({
    ok: true,
    // Spoken aloud, so the model is told to summarise rather than read the block out. The written
    // transports get the same text without this instruction.
    result: `${result}\n\nSay this in your own words, in two or three sentences. Do not read it out as written.`,
  });
}

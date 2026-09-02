import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { executeCommerceTool } from "@/lib/commerce/tools";

export const dynamic = "force-dynamic";

/**
 * The voice twin of the chat `find_product` tool.
 *
 * Vapi calls this mid-call, over HTTP, with the shared secret every other tool route uses. The
 * DOMAIN logic is not duplicated: this is a thin transport around `executeCommerceTool`, exactly
 * as `lib/platform/reply/tools.ts` is the chat transport around the same function. The two must
 * never drift, because a customer who asks the same question by phone and by chat has to get the
 * same number.
 *
 * **Why the org is never in the body.** A voice tool call carries no session and no cookie. The
 * only trustworthy identifiers are the ones Vapi asserts in headers — the call and the assistant —
 * and both resolve to an org through a table we own. Believing an `org_id` in the body would let
 * anyone holding the shared secret read any workspace's catalogue.
 *
 * Answers 200 with `{ ok, result }` even for a miss: on a phone call, "I could not find that" is
 * an answer the assistant should speak, and a non-2xx makes Vapi say something generic instead.
 * A 401 is the one real failure — it must not look like success (the create_ticket lesson).
 */

/**
 * The body Vapi actually sends, which is only what the model filled in.
 *
 * `call_id` is NOT required here, and that is the whole lesson of this file. Vapi's `apiRequest`
 * tools carry the call identity in **headers** (`x-vapi-call-id`), not in the body — the live
 * `create_ticket` tool is configured that way while its route's schema demands `call_id` and
 * `description` in the body, which means that tool's every call fails validation. (Tickets still
 * appear because `ensureTicketForCall` in the webhook creates them regardless — the never-dead-end
 * guarantee has been quietly covering for a broken tool.) Filed rather than fixed here.
 */
const RequestSchema = z.object({
  query: z.string().max(200).optional(),
  sku: z.string().max(120).optional(),
  /** Accepted if present, but the header is the trusted source. */
  call_id: z.string().max(120).optional(),
});

function authorized(request: NextRequest): boolean {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return false;
  const incoming = request.headers.get("x-denku-secret");
  return Boolean(incoming) && incoming === expected;
}

/**
 * Which workspace is asking — resolved from the call, then from the assistant.
 *
 * The assistant fallback is not belt-and-braces, it is the one that actually works early. A caller
 * can ask "do you have this in red" in the first ten seconds, and the `calls` row is written by the
 * webhook, which does not necessarily have a row in place by then. `agents.vapi_assistant_id` is
 * true from the moment the call connects.
 *
 * Both are lookups keyed on something Vapi asserts in a header. Neither reads an org id from the
 * body: anyone holding the shared secret could then name any workspace and read its catalogue.
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

/** A uuid-ish call id from the header Vapi sends, or the body as a fallback. */
function callIdFrom(request: NextRequest, body: { call_id?: string }): string | null {
  const header = request.headers.get("x-vapi-call-id");
  const value = (header && header.trim()) || (body.call_id && body.call_id.trim()) || "";
  // Vapi sends the literal "{{call.id}}" when a template fails to resolve — never query on that.
  if (!value || value.includes("{{")) return null;
  return value;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    console.warn("[TOOL][FIND_PRODUCT][UNAUTHORIZED]");
    return NextResponse.json({ ok: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_JSON" } });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION_FAILED" } });
  }
  if (!parsed.data.query && !parsed.data.sku) {
    return NextResponse.json({
      ok: false,
      result: "Ask the caller which product they mean, then call this again.",
    });
  }

  const callId = callIdFrom(request, parsed.data);
  const assistantHeader = request.headers.get("x-vapi-assistant-id");
  const assistantId = assistantHeader && !assistantHeader.includes("{{") ? assistantHeader.trim() : null;

  const orgId = await resolveOrg(callId, assistantId);
  if (!orgId) {
    console.warn("[TOOL][FIND_PRODUCT][NO_ORG]", { call_id: callId, assistant_id: assistantId });
    return NextResponse.json({
      ok: false,
      result: "The store's catalogue could not be reached just now. Tell the caller you cannot check the stock at this moment.",
    });
  }

  console.info("[TOOL_CALLED]", { tool: "find_product", org_id: orgId, call_id: callId });

  const outcome = await executeCommerceTool(
    "find_product",
    { query: parsed.data.query, sku: parsed.data.sku },
    { orgId }
  );

  console.info("[TOOL_RESULT]", {
    tool: "find_product",
    org_id: orgId,
    call_id: callId,
    ok: outcome.ok,
  });

  /**
   * `result` is spoken aloud, so it is trimmed harder than the chat version.
   *
   * A twenty-variant list read out by a voice assistant is a caller hanging up. The instruction
   * tells the model to summarise rather than enumerate; the full text is still there for the
   * cases where there are only two or three.
   */
  return NextResponse.json({
    ok: outcome.ok,
    result: outcome.message.slice(0, 1200),
    speak_hint: "Summarise this out loud. Do not read out every variant — say what is available and ask which they want.",
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, { status: 405 });
}

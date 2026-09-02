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
 * **Why the org comes from `call_id`.** A voice tool call carries no session and no cookie. The
 * only trustworthy identifier is the call this tool was invoked from, which `calls` already maps
 * to an org. Believing an `org_id` in the body would let anyone holding the shared secret read any
 * workspace's catalogue.
 *
 * Answers 200 with `{ ok, result }` even for a miss: on a phone call, "I could not find that" is
 * an answer the assistant should speak, and a non-2xx makes Vapi say something generic instead.
 * A 401 is the one real failure — it must not look like success (the create_ticket lesson).
 */

const RequestSchema = z.object({
  call_id: z.string().min(1),
  query: z.string().max(200).optional(),
  sku: z.string().max(120).optional(),
});

function authorized(request: NextRequest): boolean {
  const expected = process.env.DENKU_TOOL_SECRET;
  if (!expected) return false;
  const incoming = request.headers.get("x-denku-secret");
  return Boolean(incoming) && incoming === expected;
}

/** The workspace this call belongs to. Accepts either our row id or Vapi's own call id. */
async function orgForCall(callId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("calls")
      .select("org_id")
      .or(`id.eq.${callId},vapi_call_id.eq.${callId}`)
      .limit(1)
      .maybeSingle<{ org_id: string }>();
    return data?.org_id ?? null;
  } catch {
    return null;
  }
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

  const orgId = await orgForCall(parsed.data.call_id);
  if (!orgId) {
    console.warn("[TOOL][FIND_PRODUCT][NO_ORG]", { call_id: parsed.data.call_id });
    return NextResponse.json({
      ok: false,
      result: "The store's catalogue could not be reached just now. Tell the caller you cannot check the stock at this moment.",
    });
  }

  console.info("[TOOL_CALLED]", { tool: "find_product", org_id: orgId, call_id: parsed.data.call_id });

  const outcome = await executeCommerceTool(
    "find_product",
    { query: parsed.data.query, sku: parsed.data.sku },
    { orgId }
  );

  console.info("[TOOL_RESULT]", {
    tool: "find_product",
    org_id: orgId,
    call_id: parsed.data.call_id,
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardPlatformAdmin } from "@/lib/platform-admin/access";
import { createGrant } from "@/lib/platform-admin/grantService";
import { GRANT_KINDS } from "@/lib/billing/grants";
import { MAX_GRANT_DAYS } from "@/lib/platform-admin/grantService";

/**
 * POST /api/admin/platform/grants — hand a workspace capacity it has not paid for.
 *
 * Two locks stand in front of this: `/api/admin/*` is behind HTTP Basic Auth in `middleware.ts`,
 * and `guardPlatformAdmin()` requires the signed-in account to be on the platform allowlist. Both
 * are required. The Basic Auth password alone gets an operator to the door and no further.
 *
 * `provisionLine` is the only field here that spends money, and it is opt-in for that reason: every
 * other grant merely raises a ceiling, while this one rents a phone number that bills monthly until
 * the grant is withdrawn or lapses.
 */

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(GRANT_KINDS),
  amount: z.number().int().positive(),
  days: z.number().int().positive().max(MAX_GRANT_DAYS),
  note: z.string().max(500).optional(),
  provisionLine: z.boolean().optional(),
  preferredAreaCode: z
    .string()
    .regex(/^\d{3}$/)
    .optional(),
});

export async function POST(req: NextRequest) {
  const gate = await guardPlatformAdmin();
  if (!gate.ok) return gate.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const body = parsed.data;

  // A line can only back a `phone_numbers` grant. Asking for one alongside minutes is a mistake,
  // not a request to guess — and guessing here buys a phone number.
  if (body.provisionLine && body.kind !== "phone_numbers") {
    return NextResponse.json(
      { ok: false, error: "A phone line can only be provisioned for a phone_numbers grant" },
      { status: 400 }
    );
  }

  const result = await createGrant({
    orgId: body.orgId,
    kind: body.kind,
    amount: body.amount,
    days: body.days,
    note: body.note ?? null,
    actorUserId: gate.admin.userId,
    provisionLine: body.provisionLine ?? false,
    preferredAreaCode: body.preferredAreaCode ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    grant: result.grant,
    line: result.line ?? null,
    // Said explicitly rather than inferred from `line`, so the UI can tell "you did not ask for a
    // number" apart from "you asked and it failed" — two situations that look identical otherwise.
    lineRequested: Boolean(body.provisionLine),
  });
}

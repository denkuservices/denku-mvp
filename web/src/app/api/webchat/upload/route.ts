import { NextRequest } from "next/server";
import { getConnectionById } from "@/lib/webchat/connections";
import { getSessionById } from "@/lib/webchat/sessions";
import { verifySessionToken } from "@/lib/webchat/token";
import { allow, connectionUsable, corsFor, preflight, refuse, requestOrigin } from "@/lib/webchat/http";
import {
  MAX_WEBCHAT_UPLOAD_BYTES,
  storeVisitorUpload,
  webChatUploadKind,
  withinUploadBudget,
} from "@/lib/webchat/uploads";

export const dynamic = "force-dynamic";

/**
 * A website visitor attaches a photo or a voice memo.
 *
 * The endpoint is deliberately dumb: it takes ONE file, checks it against everything in
 * `lib/webchat/uploads.ts`, stores it, and returns the key. It does not create a message, touch a
 * conversation, or call a model — the visitor may still change their mind and never press send.
 * Splitting it from `send` is also what keeps `send` a small JSON endpoint instead of a multipart
 * parser that sometimes answers a customer.
 *
 * Identity comes from the signed session token, exactly as it does in `send`. The request body is
 * a file and a claim about its name; neither is ever believed about which workspace this is.
 *
 * It answers `413` when the file is too big and `415` when it is the wrong kind, because those are
 * the two cases where the visitor can actually do something differently, and the widget says so.
 */

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  const origin = requestOrigin(req);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("bad_request", 400);
  }

  const claims = verifySessionToken(String(form.get("token") ?? ""));
  if (!claims) return refuse("invalid_session", 401);

  const connection = await getConnectionById(claims.cid);
  const problem = connectionUsable(connection, origin);
  if (problem || !connection) return refuse(problem ?? "origin_not_allowed", 403);

  const session = await getSessionById(claims.sid);
  if (!session || session.orgId !== claims.org || session.connectionId !== connection.id) {
    return refuse("invalid_session", 401);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return refuse("bad_request", 400);

  // The declared size first — refusing a 40 MB video before reading it is the difference between
  // a fast 413 and a function that spends its memory budget on something it will throw away.
  if (file.size > MAX_WEBCHAT_UPLOAD_BYTES) return refuse("too_large", 413);

  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!webChatUploadKind(mime)) return refuse("unsupported_type", 415);

  if (!(await withinUploadBudget(session.orgId, session.id))) {
    console.warn("[WEBCHAT][UPLOAD][BUDGET][EXHAUSTED]", { org_id: session.orgId, session_id: session.id });
    return refuse("rate_limited", 429);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Checked again on the real bytes: `File.size` is what the client said, and this is what arrived.
  if (bytes.byteLength > MAX_WEBCHAT_UPLOAD_BYTES) return refuse("too_large", 413);

  const stored = await storeVisitorUpload({
    orgId: session.orgId,
    sessionId: session.id,
    mime,
    bytes,
    filename: file.name,
  });

  if (!stored) return refuse("server_error", 500);

  console.info("[WEBCHAT][UPLOAD][STORED]", {
    org_id: session.orgId,
    session_id: session.id,
    kind: stored.kind,
    size: stored.size,
  });

  return allow(corsFor(origin), {
    ok: true,
    // The widget hands this straight back on `send`; it is a storage key scoped to this session,
    // and useless to anyone else because `send` re-checks that scoping.
    attachment: {
      ref: stored.path,
      kind: stored.kind,
      mime: stored.mime,
      size: stored.size,
      filename: stored.filename,
    },
  });
}

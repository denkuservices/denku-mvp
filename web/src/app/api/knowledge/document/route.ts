import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { guard } from "@/lib/auth/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/observability/logEvent";
import {
  extractKnowledgeText,
  extractionFailureMessage,
  isSupportedKnowledgeType,
  MAX_DOCUMENT_BYTES,
} from "@/lib/knowledge/extract";
import { suggestKnowledgeFromText } from "@/lib/knowledge/suggest";

export const dynamic = "force-dynamic";
// Extraction plus a model pass over a long document. The default would cut a large price list off
// mid-read and report it as unreadable.
export const maxDuration = 60;

/**
 * POST /api/knowledge/document — upload a document and get Knowledge suggestions back.
 *
 * **This does not save anything to the employee.** It stores the document, extracts its text, asks
 * a model what the document says about the business, and returns that for a person to review. The
 * owner accepts, edits, or discards it in the Knowledge form, which then saves through the action
 * that has always owned that write.
 *
 * The review step is the point, not friction to be removed later. Everything extracted here ends
 * up in a system prompt that a business's customers hear spoken aloud on the telephone — a wrong
 * opening hour is somebody standing at a locked door. So the extractor is told to leave what it
 * cannot evidence blank, and a human sees the result before a caller does.
 */
export async function POST(req: NextRequest) {
  const gate = await guard("manage_workspace_settings");
  if (!gate.ok) return gate.response;

  const orgId = gate.viewer.orgId;
  if (!orgId) {
    return NextResponse.json({ ok: false, error: "No workspace" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload" }, { status: 400 });
  }

  const file = form.get("file");
  const agentIdRaw = form.get("agentId");
  const agentId = typeof agentIdRaw === "string" && agentIdRaw.trim() ? agentIdRaw.trim() : null;

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Choose a file to upload" }, { status: 400 });
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { ok: false, error: extractionFailureMessage("too_large") },
      { status: 413 }
    );
  }

  if (!isSupportedKnowledgeType(file.type, file.name)) {
    return NextResponse.json(
      { ok: false, error: extractionFailureMessage("unsupported_type") },
      { status: 415 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // The key starts with the org id so a signed read can be authorised before it is ever minted —
  // same shape as the channel-media store.
  const storageKey = `${orgId}/${randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120)}`;

  const { data: row, error: insertErr } = await supabaseAdmin
    .from("agent_knowledge_documents")
    .insert({
      org_id: orgId,
      agent_id: agentId,
      filename: file.name.slice(0, 300),
      mime_type: file.type || null,
      byte_size: file.size,
      storage_key: storageKey,
      status: "pending",
      uploaded_by: gate.viewer.profileId,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr || !row) {
    return NextResponse.json({ ok: false, error: "Could not save that document" }, { status: 500 });
  }

  // Storage is best-effort and deliberately not fatal: the extraction below is what the owner is
  // waiting for, and losing the ability to re-extract later is a smaller failure than refusing an
  // upload that we could otherwise read right now.
  const upload = await supabaseAdmin.storage
    .from("knowledge-documents")
    .upload(storageKey, bytes, { contentType: file.type || "application/octet-stream", upsert: false });

  if (upload.error) {
    logEvent({
      tag: "[KNOWLEDGE][DOCUMENT][STORE_FAILED]",
      ts: Date.now(),
      stage: "TOOL",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: { document_id: row.id, error: upload.error.message },
    });
  }

  const extraction = await extractKnowledgeText(bytes, file.type, file.name);

  if (!extraction.ok) {
    await supabaseAdmin
      .from("agent_knowledge_documents")
      .update({
        status: "failed",
        failure_reason: extraction.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("org_id", orgId);

    return NextResponse.json(
      { ok: false, error: extractionFailureMessage(extraction.reason) },
      { status: 422 }
    );
  }

  await supabaseAdmin
    .from("agent_knowledge_documents")
    .update({
      status: "extracted",
      extracted_text: extraction.document.text,
      page_count: extraction.document.pageCount,
      truncated: extraction.document.truncated,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("org_id", orgId);

  const suggestion = await suggestKnowledgeFromText(extraction.document.text);

  logEvent({
    tag: "[KNOWLEDGE][DOCUMENT][EXTRACTED]",
    ts: Date.now(),
    stage: "TOOL",
    source: "system",
    org_id: orgId,
    severity: "info",
    details: {
      document_id: row.id,
      pages: extraction.document.pageCount,
      truncated: extraction.document.truncated,
      filled: Object.keys(suggestion.fields).length,
      missing: suggestion.missing.length,
      source: suggestion.source,
    },
  });

  return NextResponse.json({
    ok: true,
    documentId: row.id,
    filename: file.name,
    pageCount: extraction.document.pageCount,
    truncated: extraction.document.truncated,
    suggestion,
  });
}

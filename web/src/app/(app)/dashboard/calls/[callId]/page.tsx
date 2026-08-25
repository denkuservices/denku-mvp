import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * A call is a conversation (Sprint 13).
 *
 * This page held the recording, the cost and the audit metadata, and the conversation detail
 * linked out to it — so hearing a call meant leaving the thread for a differently-styled page.
 * The recording and cost now render inside the conversation's context rail; the call id IS the
 * conversation id, so this forwards straight there.
 */
export default async function CallDetailRedirect({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = await params;
  redirect(platformUxEnabled() ? `/dashboard/inbox/${callId}` : "/dashboard/calls");
}

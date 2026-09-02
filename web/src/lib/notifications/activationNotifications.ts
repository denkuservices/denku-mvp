import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";
import { resolveOrgOwnerEmail } from "@/lib/notifications/recipient";
import { sendOnce } from "@/lib/email/dispatch";
import { aiLiveTemplate } from "@/lib/email/templates/aiLive";
import { resolveOrgEmailLocale } from "@/lib/email/locale.server";

/**
 * "Your AI is live" — sent once per workspace, when activation binds a real number.
 *
 * NOT behind `BILLING_NOTIFICATIONS_ENABLED`: that flag stages the money mail. This is
 * the onboarding pair to the welcome email (also unflagged) — a customer who has just
 * paid and waited through provisioning should be told the thing they bought exists, and
 * be told the number, which is otherwise only ever shown on a screen they may have
 * closed.
 *
 * Deduped on the org id: activation is explicitly resume-from-partial and can run
 * several times, but a workspace goes live once.
 *
 * NEVER THROWS — activation must complete regardless of the mail server.
 */
export async function notifyAiLive(orgId: string, phoneNumberE164: string): Promise<void> {
  try {
    if (!orgId || !phoneNumberE164) return;

    const to = await resolveOrgOwnerEmail(orgId);
    if (!to) return;

    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("name")
      .eq("id", orgId)
      .maybeSingle<{ name: string | null }>();

    const { subject, html } = aiLiveTemplate({
      phoneNumberE164,
      orgName: org?.name ?? null,
      dashboardUrl: `${getBaseUrl()}/dashboard`,
      locale: await resolveOrgEmailLocale(orgId, to),
    });

    await sendOnce({
      kind: "ai_live",
      dedupeKey: orgId,
      to,
      subject,
      html,
      orgId,
      // `hello@` — this mail invites a reply about the greeting, so it must come from an
      // address a person actually reads.
      sender: "welcome",
    });
  } catch (err) {
    console.error("[ACTIVATION][NOTIFY] notifyAiLive failed (non-fatal)", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Workspace-paused alert email (R-009) — sent to the owner when billing pauses the
 * workspace (hard_cap or past_due), so a business phone never goes dead silently.
 * Pure; caller resolves recipient + sends.
 */

export type PauseReason = "hard_cap" | "past_due";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function workspacePausedTemplate(params: {
  reason: PauseReason;
  orgName?: string | null;
  billingUrl: string;
}): { subject: string; html: string } {
  const { reason, orgName, billingUrl } = params;

  const isHardCap = reason === "hard_cap";
  const subject = isHardCap
    ? "⚠️ Your Denku AI line is paused — usage cap reached"
    : "⚠️ Your Denku AI line is paused — payment needed";

  const headline = isHardCap
    ? "Your AI line has been paused"
    : "Your AI line has been paused";

  const reasonLine = isHardCap
    ? "You reached your monthly overage cap, so we paused inbound calls to prevent further charges. Your AI is not answering calls right now."
    : "A recent payment didn't go through, so we paused your AI line. Your AI is not answering calls right now.";

  const action = isHardCap
    ? "Raise your cap or review usage to resume answering calls."
    : "Update your payment method to resume answering calls.";

  const greeting = orgName ? `Hi ${esc(orgName)},` : "Hi,";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;">
<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;padding:48px 20px;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:20px;padding:40px;border:1px solid #fee2e2;box-shadow:0 4px 24px rgba(0,0,0,0.06);text-align:left;">
    <p style="font-size:14px;color:#64748b;margin:0 0 8px 0;">${greeting}</p>
    <h1 style="font-size:22px;font-weight:700;color:#b91c1c;margin:0 0 12px 0;letter-spacing:-0.02em;">
      ${esc(headline)}
    </h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">${esc(reasonLine)}</p>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 20px 0;font-weight:600;">${esc(action)}</p>
    <div style="margin:8px 0 8px 0;">
      <a href="${esc(billingUrl)}" style="background-color:#b91c1c;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        Manage billing
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-top:32px;">
      You're receiving this because your Denku AI line was paused. This is a service alert, not marketing.
    </p>
  </div>
</div>
</body>
</html>
`.trim();

  return { subject, html };
}

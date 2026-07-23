/**
 * Usage-threshold alert email (R-009) — "you've used X% of your included minutes",
 * sent as an org crosses 50/75/90% so overage is never a surprise. Pure.
 */

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function usageAlertTemplate(params: {
  thresholdPct: number;
  billableMinutes: number;
  includedMinutes: number;
  orgName?: string | null;
  billingUrl: string;
}): { subject: string; html: string } {
  const { thresholdPct, billableMinutes, includedMinutes, orgName, billingUrl } = params;

  const subject = `You've used ${thresholdPct}% of your included minutes`;
  const greeting = orgName ? `Hi ${esc(orgName)},` : "Hi,";
  const remaining = Math.max(includedMinutes - billableMinutes, 0);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;">
<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;padding:48px 20px;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:20px;padding:40px;border:1px solid #fef3c7;box-shadow:0 4px 24px rgba(0,0,0,0.06);text-align:left;">
    <p style="font-size:14px;color:#64748b;margin:0 0 8px 0;">${greeting}</p>
    <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 12px 0;letter-spacing:-0.02em;">
      You've used ${esc(String(thresholdPct))}% of this month's minutes
    </h1>
    <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">
      Your AI has used <strong>${esc(billableMinutes.toLocaleString())}</strong> of your
      <strong>${esc(includedMinutes.toLocaleString())}</strong> included minutes this month
      (about <strong>${esc(remaining.toLocaleString())}</strong> left before overage rates apply).
    </p>
    <p style="font-size:14px;line-height:1.6;color:#64748b;margin:0 0 20px 0;">
      No action needed — this is a heads-up so overage charges are never a surprise. You can review
      usage or adjust your plan anytime.
    </p>
    <div style="margin:8px 0;">
      <a href="${esc(billingUrl)}" style="background-color:#0f172a;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        View usage &amp; billing
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-top:32px;">
      You're receiving this usage alert for your Denku workspace.
    </p>
  </div>
</div>
</body>
</html>
`.trim();

  return { subject, html };
}

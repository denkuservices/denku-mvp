/**
 * Artifact notification email (R-008) — sent to the workspace owner when the AI
 * captures a new ticket or appointment from a call. Makes the core "never miss a
 * call" value visible between logins.
 *
 * Pure and dependency-free (unit-tested): takes already-resolved fields and returns
 * `{ subject, html }`. Recipient resolution, idempotency, and sending live in
 * `lib/notifications/artifactNotifications.ts`.
 */

export type ArtifactKind = "ticket" | "appointment";

export interface ArtifactNotificationParams {
  kind: ArtifactKind;
  /** Human title, e.g. the ticket subject or "Appointment request". */
  title: string;
  /** Caller display (name or masked phone), optional. */
  caller?: string | null;
  /** Short transcript/summary snippet, optional. */
  snippet?: string | null;
  /** Absolute deep link into the dashboard for this artifact. */
  deepLink: string;
  /** Workspace name, for the greeting. Optional. */
  orgName?: string | null;
}

/** Escape user-derived text before embedding in HTML (transcripts are caller-controlled). */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function artifactNotificationTemplate(
  params: ArtifactNotificationParams
): { subject: string; html: string } {
  const { kind, title, caller, snippet, deepLink, orgName } = params;

  const noun = kind === "appointment" ? "appointment request" : "ticket";
  const emoji = kind === "appointment" ? "📅" : "📋";
  const subject =
    kind === "appointment"
      ? `New appointment request — ${title}`
      : `New ticket — ${title}`;

  const callerLine = caller
    ? `<p style="font-size:14px;color:#334155;margin:0 0 6px 0;"><strong>From:</strong> ${esc(caller)}</p>`
    : "";

  const snippetBlock = snippet
    ? `<div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0;text-align:left;">
         <p style="font-size:13px;color:#64748b;margin:0;white-space:pre-wrap;">${esc(
           snippet.length > 600 ? snippet.slice(0, 600) + "…" : snippet
         )}</p>
       </div>`
    : "";

  const greeting = orgName ? `Hi ${esc(orgName)},` : "Hi,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;">
<div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;padding:48px 20px;">
  <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border-radius:20px;padding:40px;border:1px solid #f1f5f9;box-shadow:0 4px 24px rgba(0,0,0,0.06);text-align:left;">
    <p style="font-size:14px;color:#64748b;margin:0 0 8px 0;">${greeting}</p>
    <h1 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 4px 0;letter-spacing:-0.02em;">
      ${emoji} Your AI captured a new ${esc(noun)}
    </h1>
    <p style="font-size:16px;font-weight:600;color:#0f172a;margin:16px 0 6px 0;">${esc(title)}</p>
    ${callerLine}
    ${snippetBlock}
    <div style="margin:28px 0 8px 0;">
      <a href="${esc(deepLink)}" style="background-color:#0f172a;color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
        View ${esc(noun)}
      </a>
    </div>
    <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin-top:32px;">
      You're receiving this because your Denku AI created a work item from a call.
      Manage notifications in your workspace settings.
    </p>
  </div>
</div>
</body>
</html>
`.trim();

  return { subject, html };
}

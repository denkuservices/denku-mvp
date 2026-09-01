/**
 * Artifact notification email (R-008) — sent to the workspace owner when the AI
 * captures a new ticket or appointment from a conversation. Makes the core "never miss
 * a call" value visible between logins.
 *
 * Pure and dependency-free (unit-tested): takes already-resolved fields and returns
 * `{ subject, html }`. Recipient resolution, idempotency, and sending live in
 * `lib/notifications/artifactNotifications.ts`.
 *
 * Escaping is not optional here: the title and snippet come from a caller's own words.
 * The shared helpers in `../layout` escape everything they are given.
 */

import { renderEmail, detailList, quote } from "../layout";

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

export function artifactNotificationTemplate(
  params: ArtifactNotificationParams
): { subject: string; html: string } {
  const { kind, title, caller, snippet, deepLink, orgName } = params;

  const noun = kind === "appointment" ? "appointment request" : "ticket";
  const subject =
    kind === "appointment"
      ? `New appointment request — ${title}`
      : `New ticket — ${title}`;

  const blocks = [
    detailList([
      { label: kind === "appointment" ? "Request" : "Subject", value: title, strong: true },
      ...(caller ? [{ label: "From", value: caller }] : []),
      { label: "Captured by", value: "Your AI employee" },
    ]),
    ...(snippet ? [quote(snippet, "From the conversation")] : []),
  ];

  const html = renderEmail({
    title: subject,
    preheader: `Your AI captured a new ${noun}${caller ? ` from ${caller}` : ""}.`,
    eyebrow: kind === "appointment" ? "New appointment request" : "New ticket",
    heading: `Your AI captured a new ${noun}`,
    greeting: orgName ? `Hi ${orgName},` : "Hi,",
    intro:
      kind === "appointment"
        ? "Someone asked to book time with you. Nothing is confirmed until you accept it."
        : "Someone got in touch and your AI turned the conversation into a work item.",
    tone: "positive",
    blocks,
    cta: { label: `View ${noun}`, url: deepLink },
    reason:
      "You're receiving this because your AI employee created a work item from a conversation. You can turn these off in your workspace settings.",
  });

  return { subject, html };
}

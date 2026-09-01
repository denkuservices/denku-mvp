/**
 * Member invitation email (Sprint 6, L4 / R-010). Plain, honest copy — the invitee joins
 * the workspace when they sign up with this email.
 *
 * The one mail in the estate sent to someone who has never heard of Denku, so it says
 * who invited them and what the product is before it asks for anything.
 */

import { renderEmail, detailList, paragraph } from "../layout";

export function memberInviteTemplate(params: {
  orgName: string;
  inviterName: string | null;
  signupUrl: string;
}): { subject: string; html: string } {
  const { orgName, inviterName, signupUrl } = params;
  const subject = `You're invited to join ${orgName} on Denku`;

  const html = renderEmail({
    title: subject,
    preheader: `${inviterName ? `${inviterName} invited you` : "You've been invited"} to the ${orgName} workspace on Denku.`,
    eyebrow: "Invitation",
    heading: `Join ${orgName} on Denku`,
    intro: inviterName
      ? `**${inviterName}** invited you to the **${orgName}** workspace on Denku — where the business sees every call, message and booking its AI employee handles.`
      : `You've been invited to the **${orgName}** workspace on Denku — where the business sees every call, message and booking its AI employee handles.`,
    blocks: [
      detailList([
        { label: "Workspace", value: orgName, strong: true },
        ...(inviterName ? [{ label: "Invited by", value: inviterName }] : []),
        { label: "Expires", value: "14 days from today" },
      ]),
      paragraph(
        "Sign up with **this email address** and you'll be added to the workspace automatically."
      ),
    ],
    cta: { label: "Accept invitation", url: signupUrl },
    reason:
      "You're receiving this because someone invited this address to a Denku workspace. If you weren't expecting it, you can ignore this email.",
  });

  return { subject, html };
}

/**
 * Member invitation email (Sprint 6, L4 / R-010). Plain, honest copy — the invitee joins the
 * workspace when they sign up with this email.
 */
export function memberInviteTemplate(params: {
  orgName: string;
  inviterName: string | null;
  signupUrl: string;
}): { subject: string; html: string } {
  const { orgName, inviterName, signupUrl } = params;
  const who = inviterName ? `${inviterName} has` : "You have been";
  const subject = `You're invited to join ${orgName} on Denku`;
  const html = `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#0a1a2f">
    <h2 style="font-size:20px;margin:0 0 12px">Join ${orgName} on Denku</h2>
    <p style="font-size:14px;line-height:1.6;color:#334155">
      ${who} invited you to the <strong>${orgName}</strong> workspace on Denku. Sign up with this
      email address and you'll be added to the workspace automatically.
    </p>
    <p style="margin:20px 0">
      <a href="${signupUrl}" style="display:inline-block;background:#1B6E6E;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">
        Accept invitation
      </a>
    </p>
    <p style="font-size:12px;color:#94a3b8">This invitation expires in 14 days. If you weren't expecting it, you can ignore this email.</p>
  </div>`;
  return { subject, html };
}

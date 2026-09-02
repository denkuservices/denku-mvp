/**
 * Member invitation email (Sprint 6, L4 / R-010). Plain, honest copy — the invitee joins
 * the workspace when they sign up with this email.
 *
 * The one mail in the estate sent to someone who has never heard of Denku, so it says
 * who invited them and what the product is before it asks for anything.
 */

import { renderEmail, detailList, paragraph } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export function memberInviteTemplate(params: {
  orgName: string;
  inviterName: string | null;
  signupUrl: string;
  locale?: EmailLocale;
}): { subject: string; html: string } {
  const { orgName, inviterName, signupUrl, locale = "en" } = params;
  const t = emailCopy(locale, {
    en: { subject: `You're invited to join ${orgName} on Denku`, invited: "invited you", fallback: "You've been invited", workspace: "workspace", eyebrow: "Invitation", heading: `Join ${orgName} on Denku`, introWith: `**${inviterName}** invited you to the **${orgName}** workspace on Denku — where the business sees every call, message and booking its AI employee handles.`, introWithout: `You've been invited to the **${orgName}** workspace on Denku — where the business sees every call, message and booking its AI employee handles.`, workspaceLabel: "Workspace", by: "Invited by", expires: "Expires", days: "14 days from today", note: "Sign up with **this email address** and you'll be added to the workspace automatically.", cta: "Accept invitation", reason: "You're receiving this because someone invited this address to a Denku workspace. If you weren't expecting it, you can ignore this email." },
    es: { subject: `Te invitaron a unirte a ${orgName} en Denku`, invited: "te invitó", fallback: "Te han invitado", workspace: "espacio de trabajo", eyebrow: "Invitación", heading: `Únete a ${orgName} en Denku`, introWith: `**${inviterName}** te invitó al espacio de trabajo **${orgName}** en Denku, donde el negocio ve cada llamada, mensaje y reserva que gestiona su empleado de IA.`, introWithout: `Te han invitado al espacio de trabajo **${orgName}** en Denku, donde el negocio ve cada llamada, mensaje y reserva que gestiona su empleado de IA.`, workspaceLabel: "Espacio de trabajo", by: "Invitado por", expires: "Caduca", days: "En 14 días", note: "Regístrate con **esta dirección de correo** y se te añadirá automáticamente al espacio de trabajo.", cta: "Aceptar invitación", reason: "Recibes este correo porque alguien invitó esta dirección a un espacio de trabajo Denku. Si no lo esperabas, puedes ignorarlo." },
    de: { subject: `Sie wurden eingeladen, ${orgName} auf Denku beizutreten`, invited: "hat Sie eingeladen", fallback: "Sie wurden eingeladen", workspace: "Arbeitsbereich", eyebrow: "Einladung", heading: `${orgName} auf Denku beitreten`, introWith: `**${inviterName}** hat Sie in den Arbeitsbereich **${orgName}** auf Denku eingeladen. Dort sieht das Unternehmen jeden Anruf, jede Nachricht und jede Buchung, die sein KI-Mitarbeiter bearbeitet.`, introWithout: `Sie wurden in den Arbeitsbereich **${orgName}** auf Denku eingeladen. Dort sieht das Unternehmen jeden Anruf, jede Nachricht und jede Buchung, die sein KI-Mitarbeiter bearbeitet.`, workspaceLabel: "Arbeitsbereich", by: "Eingeladen von", expires: "Läuft ab", days: "In 14 Tagen", note: "Registrieren Sie sich mit **dieser E-Mail-Adresse**; Sie werden automatisch zum Arbeitsbereich hinzugefügt.", cta: "Einladung annehmen", reason: "Sie erhalten diese E-Mail, weil jemand diese Adresse zu einem Denku-Arbeitsbereich eingeladen hat. Wenn Sie das nicht erwartet haben, können Sie sie ignorieren." },
    tr: { subject: `${orgName} çalışma alanına Denku üzerinden davet edildiniz`, invited: "sizi davet etti", fallback: "Davet edildiniz", workspace: "çalışma alanına", eyebrow: "Davet", heading: `${orgName} çalışma alanına katılın`, introWith: `**${inviterName}**, sizi Denku'daki **${orgName}** çalışma alanına davet etti. İşletme burada yapay zekâ çalışanının yönettiği her aramayı, mesajı ve rezervasyonu görür.`, introWithout: `Denku'daki **${orgName}** çalışma alanına davet edildiniz. İşletme burada yapay zekâ çalışanının yönettiği her aramayı, mesajı ve rezervasyonu görür.`, workspaceLabel: "Çalışma alanı", by: "Davet eden", expires: "Son geçerlilik", days: "Bugünden itibaren 14 gün", note: "**Bu e-posta adresiyle** kaydolduğunuzda çalışma alanına otomatik olarak ekleneceksiniz.", cta: "Daveti kabul et", reason: "Bu e-postayı birisi bu adresi Denku çalışma alanına davet ettiği için alıyorsunuz. Daveti beklemiyorsanız e-postayı yok sayabilirsiniz." },
  });
  const subject = t.subject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: `${inviterName ? `${inviterName} ${t.invited}` : t.fallback} ${t.workspace} ${orgName} — Denku.`,
    eyebrow: t.eyebrow,
    heading: t.heading,
    intro: inviterName ? t.introWith : t.introWithout,
    blocks: [
      detailList([
        { label: t.workspaceLabel, value: orgName, strong: true },
        ...(inviterName ? [{ label: t.by, value: inviterName }] : []),
        { label: t.expires, value: t.days },
      ]),
      paragraph(
        t.note
      ),
    ],
    cta: { label: t.cta, url: signupUrl },
    reason: t.reason,
  });

  return { subject, html };
}

/**
 * Password-changed confirmation — the security email every account system is expected
 * to send and Denku did not.
 *
 * Its value is entirely in the negative case: the person who did change their password
 * learns nothing, and the person whose account was taken over learns everything. That is
 * why it goes out on every successful change, why it names when and (roughly) from
 * where, and why the recovery path is one click and not a support queue.
 *
 * It deliberately carries no reset link of its own — a "reset your password" link in a
 * mail triggered by a password change is a phishing pattern, so it points at the normal
 * account-recovery page instead.
 */

import { renderEmail, detailList, notice } from "../layout";
import { formatDateLong } from "../brand";
import { emailCopy, type EmailLocale } from "../i18n";

export interface PasswordChangedParams {
  /** When the change happened. */
  changedAt: string | Date;
  /** Coarse client hint (browser/OS), never a full user-agent or an IP. */
  device?: string | null;
  orgName?: string | null;
  /** Where to start recovery if this wasn't them. */
  recoveryUrl: string;
  locale?: EmailLocale;
}

export function passwordChangedTemplate(params: PasswordChangedParams): {
  subject: string;
  html: string;
} {
  const { changedAt, device, orgName, recoveryUrl, locale = "en" } = params;
  const t = emailCopy(locale, {
    en: { subject: "Your Denku password was changed", preheader: "If this was you, nothing to do. If it wasn't, secure your account now.", eyebrow: "Account security", heading: "Your password was changed", hi: "Hi", intro: "The password on your Denku account was just changed. If that was you, you're all set — no action needed.", when: "When", device: "Device", notice: "**If this wasn't you**, reset your password immediately and check who has access to your workspace.", cta: "Secure my account", reason: "You're receiving this because your Denku password changed. We send this on every password change and can't turn it off — it's how you'd find out about an account takeover." },
    es: { subject: "Se cambió tu contraseña de Denku", preheader: "Si fuiste tú, no tienes que hacer nada. Si no, protege tu cuenta ahora.", eyebrow: "Seguridad de la cuenta", heading: "Se cambió tu contraseña", hi: "Hola", intro: "La contraseña de tu cuenta Denku acaba de cambiar. Si fuiste tú, no necesitas hacer nada.", when: "Cuándo", device: "Dispositivo", notice: "**Si no fuiste tú**, restablece tu contraseña de inmediato y revisa quién tiene acceso al espacio de trabajo.", cta: "Proteger mi cuenta", reason: "Recibes este correo porque cambió tu contraseña de Denku. Lo enviamos en cada cambio de contraseña y no se puede desactivar; así sabrás si alguien tomó tu cuenta." },
    de: { subject: "Ihr Denku-Passwort wurde geändert", preheader: "Wenn Sie das waren, ist nichts zu tun. Andernfalls sichern Sie jetzt Ihr Konto.", eyebrow: "Kontosicherheit", heading: "Ihr Passwort wurde geändert", hi: "Hallo", intro: "Das Passwort Ihres Denku-Kontos wurde gerade geändert. Wenn Sie das waren, ist keine weitere Aktion nötig.", when: "Zeitpunkt", device: "Gerät", notice: "**Wenn Sie das nicht waren**, setzen Sie Ihr Passwort sofort zurück und prüfen Sie, wer Zugriff auf Ihren Arbeitsbereich hat.", cta: "Mein Konto sichern", reason: "Sie erhalten diese E-Mail, weil Ihr Denku-Passwort geändert wurde. Sie wird bei jeder Passwortänderung gesendet und kann nicht deaktiviert werden – so erfahren Sie von einer Kontoübernahme." },
    tr: { subject: "Denku parolanız değiştirildi", preheader: "Bunu siz yaptıysanız işlem gerekmez. Siz yapmadıysanız hesabınızı şimdi güvene alın.", eyebrow: "Hesap güvenliği", heading: "Parolanız değiştirildi", hi: "Merhaba", intro: "Denku hesabınızın parolası az önce değiştirildi. Bunu siz yaptıysanız başka bir işlem yapmanız gerekmiyor.", when: "Zaman", device: "Cihaz", notice: "**Bunu siz yapmadıysanız** parolanızı hemen sıfırlayın ve çalışma alanınıza kimlerin erişebildiğini kontrol edin.", cta: "Hesabımı güvene al", reason: "Bu e-postayı Denku parolanız değiştiği için alıyorsunuz. Hesabınızın ele geçirildiğini fark edebilmeniz için her parola değişikliğinde gönderilir ve kapatılamaz." },
  });
  const subject = t.subject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    intro: t.intro,
    blocks: [
      detailList([
        { label: t.when, value: formatDateLong(changedAt, locale) },
        ...(device ? [{ label: t.device, value: device }] : []),
      ]),
      notice(
        t.notice,
        "critical"
      ),
    ],
    cta: { label: t.cta, url: recoveryUrl },
    reason: t.reason,
  });

  return { subject, html };
}

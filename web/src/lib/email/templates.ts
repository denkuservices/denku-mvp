/**
 * Auth email templates (verification, one-time code, password reset).
 *
 * These render through the shared `renderEmail()` chrome — the first mails a customer
 * ever receives are the ones most likely to decide whether the product looks real, and
 * they used to be the least brand-carrying thing we sent (an indigo `#4f46e5` button on
 * a white box that could have come from any starter template).
 *
 * NOTE ON WHAT ACTUALLY SENDS: Supabase Auth owns the live signup-confirmation, OTP and
 * password-recovery mails (`signInWithOtp` / `resetPasswordForEmail`), and Supabase
 * renders those from templates stored in its own dashboard, not from this file. The
 * matching HTML lives in `docs/email/supabase-auth/` and has to be pasted there by an
 * operator. These functions cover the Resend-side paths and keep one source of copy.
 *
 * Sender addresses are centralized in `./senders` (R-080) — resolved per stream at send
 * time, not hardcoded here.
 */

import { getBaseUrl } from "@/lib/utils/url";
import { renderEmail, codeBlock, linkFallback, notice } from "./layout";
import { emailCopy, type EmailLocale } from "./i18n";

/**
 * Canonical site URL, resolved per render.
 *
 * This was frozen to `https://denku-mvp.vercel.app`, so verification and password-reset emails
 * sent customers to the Vercel build host rather than denku.io. Same defect class as R-077: a
 * non-canonical URL baked into a customer-facing path. Now follows `NEXT_PUBLIC_SITE_URL`.
 */
const baseUrl = () => getBaseUrl().replace(/\/+$/, "");

/**
 * How the masthead mark is referenced — see `renderEmail`'s `logo` option.
 *
 * It is threaded through these three functions and no others, because these three are the ones
 * **Supabase** also renders: `scripts/render-supabase-auth-templates.mts` generates the dashboard
 * templates from them, and Supabase sends those mails itself with no attachment to point at. Every
 * other template in the estate is only ever sent by this repo, which always attaches the mark, so
 * they have no reason to know the option exists.
 */
export type EmailLogoMode = "inline" | "remote";

export interface VerificationEmailParams {
  email: string;
  token: string;
  redirectTo?: string;
  locale?: EmailLocale;
  logo?: EmailLogoMode;
}

export interface PasswordResetEmailParams {
  email: string;
  token: string;
  locale?: EmailLocale;
  logo?: EmailLogoMode;
}

/**
 * Email verification template for signup
 * Uses Supabase's email confirmation flow via callback URL
 */
export function getVerificationEmailHtml({ email, token, redirectTo, locale = "en", logo }: VerificationEmailParams): string {
  // For Supabase email confirmation, the redirectTo is the callback URL
  // Supabase will automatically append the confirmation token when the user clicks
  // If we have a token, use it directly; otherwise use the callback URL
  const verifyUrl = token
    ? `${baseUrl()}/verify-email?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`
    : redirectTo
    ? redirectTo // Supabase callback URL - Supabase will add the token
    : `${baseUrl()}/verify-email?email=${encodeURIComponent(email)}`;

  const t = emailCopy(locale, {
    en: { title: "Verify your email — Denku", preheader: "One click and your Denku workspace is ready to set up.", eyebrow: "Confirm your account", heading: "Verify your email address", intro: "Welcome to Denku. Confirm this address and we'll take you straight to setting up the AI that answers for your business.", cta: "Verify email", reason: "You're receiving this because this address was used to create a Denku account. If that wasn't you, ignore this email — nothing is activated until it's verified." },
    es: { title: "Verifica tu correo — Denku", preheader: "Un clic y tu espacio de trabajo Denku estará listo para configurarse.", eyebrow: "Confirma tu cuenta", heading: "Verifica tu dirección de correo", intro: "Te damos la bienvenida a Denku. Confirma esta dirección y te llevaremos directamente a configurar la IA que responde por tu negocio.", cta: "Verificar correo", reason: "Recibes este correo porque se usó esta dirección para crear una cuenta de Denku. Si no fuiste tú, ignóralo; nada se activará hasta que se verifique." },
    de: { title: "E-Mail-Adresse bestätigen – Denku", preheader: "Ein Klick, dann kann Ihr Denku-Arbeitsbereich eingerichtet werden.", eyebrow: "Konto bestätigen", heading: "E-Mail-Adresse bestätigen", intro: "Willkommen bei Denku. Bestätigen Sie diese Adresse; anschließend richten Sie direkt die KI ein, die für Ihr Unternehmen antwortet.", cta: "E-Mail bestätigen", reason: "Sie erhalten diese E-Mail, weil mit dieser Adresse ein Denku-Konto erstellt wurde. Wenn Sie das nicht waren, ignorieren Sie sie – bis zur Bestätigung wird nichts aktiviert." },
    tr: { title: "E-posta adresinizi doğrulayın — Denku", preheader: "Tek tıklamayla Denku çalışma alanınız kuruluma hazır olacak.", eyebrow: "Hesabınızı doğrulayın", heading: "E-posta adresinizi doğrulayın", intro: "Denku'ya hoş geldiniz. Bu adresi doğruladığınızda işletmeniz adına yanıt veren yapay zekâyı kurmaya geçeceksiniz.", cta: "E-postayı doğrula", reason: "Bu e-postayı, bu adresle bir Denku hesabı oluşturulduğu için alıyorsunuz. Bunu siz yapmadıysanız e-postayı yok sayın; doğrulanana kadar hiçbir şey etkinleşmez." },
  });
  return renderEmail({
    locale, logo, title: t.title, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading,
    intro: t.intro,
    cta: { label: t.cta, url: verifyUrl },
    postCta: [linkFallback(verifyUrl, locale)],
    reason: t.reason,
  });
}

/**
 * OTP code email template (for resend verification code)
 */
export function getOtpEmailHtml({ token, locale = "en", logo }: VerificationEmailParams): string {
  const t = emailCopy(locale, {
    en: { title: "Your verification code — Denku", preheader: `Your Denku verification code is ${token}. It expires in 1 hour.`, eyebrow: "Verification code", heading: "Your sign-in code", intro: "Enter this code to confirm your email address:", notice: "This code expires in **1 hour** and can be used once.", reason: "You're receiving this because someone requested a verification code for this address on Denku. If it wasn't you, no action is needed — the code alone gives no access to an existing account." },
    es: { title: "Tu código de verificación — Denku", preheader: `Tu código de verificación de Denku es ${token}. Caduca en 1 hora.`, eyebrow: "Código de verificación", heading: "Tu código de acceso", intro: "Introduce este código para confirmar tu correo:", notice: "Este código caduca en **1 hora** y solo puede usarse una vez.", reason: "Recibes este correo porque alguien solicitó un código de verificación para esta dirección en Denku. Si no fuiste tú, no tienes que hacer nada; el código por sí solo no permite entrar a una cuenta existente." },
    de: { title: "Ihr Bestätigungscode – Denku", preheader: `Ihr Denku-Bestätigungscode lautet ${token}. Er läuft in 1 Stunde ab.`, eyebrow: "Bestätigungscode", heading: "Ihr Anmeldecode", intro: "Geben Sie diesen Code ein, um Ihre E-Mail-Adresse zu bestätigen:", notice: "Dieser Code läuft in **1 Stunde** ab und kann einmal verwendet werden.", reason: "Sie erhalten diese E-Mail, weil jemand für diese Adresse einen Bestätigungscode bei Denku angefordert hat. Wenn Sie das nicht waren, ist nichts zu tun – der Code allein gewährt keinen Zugriff auf ein bestehendes Konto." },
    tr: { title: "Doğrulama kodunuz — Denku", preheader: `Denku doğrulama kodunuz ${token}. Kod 1 saat içinde sona erer.`, eyebrow: "Doğrulama kodu", heading: "Giriş kodunuz", intro: "E-posta adresinizi doğrulamak için bu kodu girin:", notice: "Bu kod **1 saat** içinde sona erer ve yalnızca bir kez kullanılabilir.", reason: "Bu e-postayı birisi Denku'da bu adres için doğrulama kodu istediği için alıyorsunuz. Bunu siz yapmadıysanız işlem gerekmez; kod tek başına mevcut bir hesaba erişim sağlamaz." },
  });
  return renderEmail({
    locale, logo, title: t.title, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading, intro: t.intro,
    blocks: [
      codeBlock(token),
      notice(t.notice, "neutral"),
    ],
    reason: t.reason,
  });
}

/**
 * Password reset email template
 */
export function getPasswordResetEmailHtml({ email, token, locale = "en", logo }: PasswordResetEmailParams): string {
  const resetUrl = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

  const t = emailCopy(locale, {
    en: { title: "Reset your password — Denku", preheader: "Choose a new password for your Denku account. The link expires in 1 hour.", eyebrow: "Account security", heading: "Reset your password", intro: "We received a request to reset the password for your Denku account.", cta: "Choose a new password", signoff: "This link expires in **1 hour**. If you didn't ask for it, you can ignore this email — your current password stays active.", reason: "You're receiving this because a password reset was requested for this address. This is a security email, not marketing." },
    es: { title: "Restablece tu contraseña — Denku", preheader: "Elige una nueva contraseña para tu cuenta Denku. El enlace caduca en 1 hora.", eyebrow: "Seguridad de la cuenta", heading: "Restablece tu contraseña", intro: "Recibimos una solicitud para restablecer la contraseña de tu cuenta Denku.", cta: "Elegir nueva contraseña", signoff: "Este enlace caduca en **1 hora**. Si no lo solicitaste, ignora el correo; tu contraseña actual seguirá activa.", reason: "Recibes este correo porque se solicitó restablecer la contraseña de esta dirección. Es un correo de seguridad, no de marketing." },
    de: { title: "Passwort zurücksetzen – Denku", preheader: "Wählen Sie ein neues Passwort für Ihr Denku-Konto. Der Link läuft in 1 Stunde ab.", eyebrow: "Kontosicherheit", heading: "Passwort zurücksetzen", intro: "Wir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Denku-Konto erhalten.", cta: "Neues Passwort wählen", signoff: "Dieser Link läuft in **1 Stunde** ab. Wenn Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr aktuelles Passwort bleibt aktiv.", reason: "Sie erhalten diese E-Mail, weil für diese Adresse ein Zurücksetzen des Passworts angefordert wurde. Dies ist eine Sicherheits-E-Mail, keine Werbung." },
    tr: { title: "Parolanızı sıfırlayın — Denku", preheader: "Denku hesabınız için yeni bir parola seçin. Bağlantı 1 saat içinde sona erer.", eyebrow: "Hesap güvenliği", heading: "Parolanızı sıfırlayın", intro: "Denku hesabınızın parolasını sıfırlama isteği aldık.", cta: "Yeni parola seç", signoff: "Bu bağlantı **1 saat** içinde sona erer. Siz istemediyseniz e-postayı yok sayabilirsiniz; mevcut parolanız etkin kalır.", reason: "Bu e-postayı bu adres için parola sıfırlama isteği yapıldığı için alıyorsunuz. Bu bir güvenlik e-postasıdır, pazarlama değildir." },
  });
  return renderEmail({
    locale, logo, title: t.title, preheader: t.preheader, eyebrow: t.eyebrow, heading: t.heading, intro: t.intro,
    cta: { label: t.cta, url: resetUrl },
    postCta: [linkFallback(resetUrl, locale)],
    signoff: t.signoff,
    reason: t.reason,
  });
}

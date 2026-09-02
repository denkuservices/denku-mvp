/**
 * Generate the Supabase Auth email templates from Denku's own email layout.
 *
 *   npx vite-node --config vitest.config.ts scripts/render-supabase-auth-templates.mts
 *
 * WHY THIS EXISTS: the signup-confirmation, one-time-code and password-recovery emails a
 * real customer receives are sent by **Supabase Auth**, not by our Resend code
 * (`signInWithOtp`, `resetPasswordForEmail`). Supabase renders them from templates stored
 * in its own dashboard, which no amount of work in this repo can change. So the estate
 * has a seam: our templates cover everything else, and these files are the half an
 * operator must paste in.
 *
 * Generating them from the same `renderEmail()` chrome is what keeps the two halves
 * looking like one company. Re-run this after any change to the layout, then paste the
 * output into Supabase Dashboard → Authentication → Emails.
 *
 * Supabase substitutes Go-template variables at send time — `{{ .ConfirmationURL }}`,
 * `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`. They pass through our HTML escaping
 * untouched (no HTML-special characters), so they can be handed in as ordinary strings.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SITE_URL ||= "https://www.denku.io";

const { renderEmail, linkFallback } = await import("../src/lib/email/layout");
const { getOtpEmailHtml } = await import("../src/lib/email/templates");

const CONFIRMATION_URL = "{{ .ConfirmationURL }}";
const TOKEN = "{{ .Token }}";

const outDir = join(process.cwd(), "..", "docs", "email", "supabase-auth");
mkdirSync(outDir, { recursive: true });

type Locale = "en" | "es" | "de" | "tr";
const locales: Locale[] = ["tr", "es", "de", "en"];
const SUBJECTS = {
  code: '{{ if eq .Data.ui_locale "tr" }}Doğrulama kodunuz — Denku{{ else if eq .Data.ui_locale "es" }}Tu código de verificación — Denku{{ else if eq .Data.ui_locale "de" }}Ihr Bestätigungscode – Denku{{ else }}Your verification code — Denku{{ end }}',
  reset: '{{ if eq .Data.ui_locale "tr" }}Parolanızı sıfırlayın — Denku{{ else if eq .Data.ui_locale "es" }}Restablece tu contraseña — Denku{{ else if eq .Data.ui_locale "de" }}Passwort zurücksetzen – Denku{{ else }}Reset your password — Denku{{ end }}',
  change: '{{ if eq .Data.ui_locale "tr" }}Yeni e-postanızı doğrulayın — Denku{{ else if eq .Data.ui_locale "es" }}Confirma tu nuevo correo — Denku{{ else if eq .Data.ui_locale "de" }}Neue E-Mail bestätigen – Denku{{ else }}Confirm new email — Denku{{ end }}',
} as const;

function byMetadata(render: (locale: Locale) => string): string {
  return locales
    .map((locale, index) => {
      const condition = index === 0
        ? '{{ if eq .Data.ui_locale "tr" }}'
        : locale === "en"
          ? "{{ else }}"
          : `{{ else if eq .Data.ui_locale "${locale}" }}`;
      return `${condition}\n${render(locale)}`;
    })
    .join("\n") + "\n{{ end }}";
}

const resetCopy = {
  en: ["Reset your password — Denku", "Choose a new password for your Denku account. The link expires in 1 hour.", "Account security", "Reset your password", "We received a request to reset the password for your Denku account.", "Choose a new password", "This link expires in **1 hour**. If you didn't ask for it, you can ignore this email — your current password stays active.", "You're receiving this because a password reset was requested for this address. This is a security email, not marketing."],
  es: ["Restablece tu contraseña — Denku", "Elige una nueva contraseña para tu cuenta Denku. El enlace caduca en 1 hora.", "Seguridad de la cuenta", "Restablece tu contraseña", "Recibimos una solicitud para restablecer la contraseña de tu cuenta Denku.", "Elegir nueva contraseña", "Este enlace caduca en **1 hora**. Si no lo solicitaste, ignora el correo; tu contraseña actual seguirá activa.", "Recibes este correo porque se solicitó restablecer la contraseña de esta dirección. Es un correo de seguridad, no de marketing."],
  de: ["Passwort zurücksetzen – Denku", "Wählen Sie ein neues Passwort für Ihr Denku-Konto. Der Link läuft in 1 Stunde ab.", "Kontosicherheit", "Passwort zurücksetzen", "Wir haben eine Anfrage zum Zurücksetzen des Passworts für Ihr Denku-Konto erhalten.", "Neues Passwort wählen", "Dieser Link läuft in **1 Stunde** ab. Wenn Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr aktuelles Passwort bleibt aktiv.", "Sie erhalten diese E-Mail, weil für diese Adresse ein Zurücksetzen des Passworts angefordert wurde. Dies ist eine Sicherheits-E-Mail, keine Werbung."],
  tr: ["Parolanızı sıfırlayın — Denku", "Denku hesabınız için yeni bir parola seçin. Bağlantı 1 saat içinde sona erer.", "Hesap güvenliği", "Parolanızı sıfırlayın", "Denku hesabınızın parolasını sıfırlama isteği aldık.", "Yeni parola seç", "Bu bağlantı **1 saat** içinde sona erer. Siz istemediyseniz e-postayı yok sayabilirsiniz; mevcut parolanız etkin kalır.", "Bu e-postayı bu adres için parola sıfırlama isteği yapıldığı için alıyorsunuz. Bu bir güvenlik e-postasıdır, pazarlama değildir."],
} as const;

const changeCopy = {
  en: ["Confirm your new email — Denku", "Confirm this address to finish moving your Denku account to it.", "Account security", "Confirm your new email address", "A request was made to change the email address on your Denku account to this one. Confirm it to finish the change.", "Confirm this address", "You're receiving this because this address was given as the new email for a Denku account."],
  es: ["Confirma tu nuevo correo — Denku", "Confirma esta dirección para terminar de trasladar tu cuenta Denku.", "Seguridad de la cuenta", "Confirma tu nueva dirección de correo", "Se solicitó cambiar el correo de tu cuenta Denku por esta dirección. Confírmala para completar el cambio.", "Confirmar esta dirección", "Recibes este correo porque esta dirección se indicó como el nuevo correo de una cuenta Denku."],
  de: ["Neue E-Mail-Adresse bestätigen – Denku", "Bestätigen Sie diese Adresse, um Ihr Denku-Konto darauf umzustellen.", "Kontosicherheit", "Neue E-Mail-Adresse bestätigen", "Für Ihr Denku-Konto wurde ein Wechsel zu dieser E-Mail-Adresse angefordert. Bestätigen Sie sie, um die Änderung abzuschließen.", "Adresse bestätigen", "Sie erhalten diese E-Mail, weil diese Adresse als neue E-Mail-Adresse für ein Denku-Konto angegeben wurde."],
  tr: ["Yeni e-posta adresinizi doğrulayın — Denku", "Denku hesabınızı bu adrese taşımayı tamamlamak için adresi doğrulayın.", "Hesap güvenliği", "Yeni e-posta adresinizi doğrulayın", "Denku hesabınızın e-posta adresini bu adresle değiştirme isteği yapıldı. Değişikliği tamamlamak için doğrulayın.", "Bu adresi doğrula", "Bu e-postayı bu adres bir Denku hesabının yeni e-posta adresi olarak verildiği için alıyorsunuz."],
} as const;

const renderLinkMail = (locale: Locale, c: readonly string[]) => renderEmail({
  locale, title: c[0], preheader: c[1], eyebrow: c[2], heading: c[3], intro: c[4],
  cta: { label: c[5], url: CONFIRMATION_URL }, postCta: [linkFallback(CONFIRMATION_URL, locale)], reason: c[c.length - 1],
});

const files: Array<{ name: string; supabaseTemplate: string; subject: string; html: string }> = [
  { name: "confirm-signup.html", supabaseTemplate: "Confirm sign up", subject: SUBJECTS.code, html: byMetadata((locale) => getOtpEmailHtml({ email: "", token: TOKEN, locale })) },
  { name: "magic-link-or-otp.html", supabaseTemplate: "Magic link or OTP", subject: SUBJECTS.code, html: byMetadata((locale) => getOtpEmailHtml({ email: "", token: TOKEN, locale })) },
  { name: "reset-password.html", supabaseTemplate: "Reset Password", subject: SUBJECTS.reset, html: byMetadata((locale) => renderLinkMail(locale, resetCopy[locale])) },
  { name: "change-email.html", supabaseTemplate: "Change Email Address", subject: SUBJECTS.change, html: byMetadata((locale) => renderLinkMail(locale, changeCopy[locale])) },
];

for (const file of files) {
  if (file.subject.length > 255) throw new Error(`${file.name} subject exceeds Supabase's 255-character limit`);
  writeFileSync(join(outDir, file.name), file.html.replace(/[ \t]+$/gm, ""), "utf8");
}

const readme = `# Supabase Auth email templates

These are the emails **Supabase Auth** sends — sign-up confirmation, the resend code, password
recovery, email change. They are NOT sent by this repo: \`signInWithOtp\` and
\`resetPasswordForEmail\` hand the send to Supabase, which renders from templates stored in its
own dashboard.

That is the one seam in Denku's email estate. Everything else (welcome, activation, billing,
notifications) renders from \`web/src/lib/email/\`; these four have to be pasted in by a person,
once.

## Generated — do not hand-edit

They are produced from the same \`renderEmail()\` chrome as every other Denku email:

\`\`\`bash
cd web && npx vite-node --config vitest.config.ts scripts/render-supabase-auth-templates.mts
\`\`\`

Edit the script (or the layout), re-run, re-paste. Hand-editing these files means the next
regeneration silently throws the edit away.

## Where each file goes

Supabase Dashboard → **Authentication → Emails** (project \`kebqwsdguxxjsijahrox\`). Paste the
file into **Message body** and set the subject:

| File | Supabase template | Subject |
|---|---|---|
${files.map((file) => `| \`${file.name}\` | ${file.supabaseTemplate} | \`${file.subject}\` |`).join("\n")}

Each body branches on \`.Data.ui_locale\` (\`en\`, \`es\`, \`de\`, \`tr\`; unknown values fall
back to English). Use
the same Go-template conditional in the Supabase **Subject** field.

**Invite user** and **Reauthentication** are deliberately not provided: Denku sends its own
workspace invitations through Resend (\`lib/email/templates/memberInvite.ts\`), and nothing in
the product triggers Supabase reauthentication.

## Why sign-up and "Magic link or OTP" both send a CODE, not a link

Two Supabase behaviours decide this, and neither is obvious:

1. **Supabase picks the template by whether the address already exists.** A new address gets
   *Confirm sign up*; an existing one gets *Magic link or OTP*. The first \`signInWithOtp({
   shouldCreateUser: true })\` CREATES the (unconfirmed) user — so in Denku the first code comes
   from *Confirm sign up* and **every "resend code" comes from *Magic link or OTP***. Both are the
   same screen to the customer.
2. **The template's variables decide what arrives.** \`{{ .Token }}\` sends six digits;
   \`{{ .ConfirmationURL }}\` sends a sign-in link. Supabase does not care which flow you meant.

Denku's verification screen only accepts a code (\`verifyOtp({ type: "email", token })\`), and the
code path is the one that then asks for a password (\`needsPassword: true\`). A customer who
receives a link instead clicks into \`/auth/callback\`, gets a session, and **skips password
setup** — an account with no password. So both templates are code-only, on purpose. Do not add
\`{{ .ConfirmationURL }}\` to either one.

## The Security notification toggles

Supabase can also send its own unbranded notices (Password changed, Email address changed, Phone
number changed, Sign-in method linked/removed, MFA added/removed).

- **Password changed → leave OFF.** Denku sends its own branded one from
  \`lib/notifications/securityNotifications.ts\` on both password-change paths. Enabling
  Supabase's too means two emails for one event.
- **Email address changed → ON is reasonable** if you expose an email-change flow: it notifies the
  OLD address, which nothing in this repo covers. Until that flow exists it can never fire.
- **Phone number changed / sign-in method / MFA → leave OFF.** Denku uses none of these, so they
  cannot fire; turning them on only risks an unbranded email appearing later.

## One thing to check after installing

The masthead logo is loaded from \`https://www.denku.io/email/denku-mark.png\`. It must be
deployed before these go out, or every one of these emails shows a broken image where the brand
should be. The text fallback is the word "Denku", so nothing breaks — it just looks like a
phishing attempt, which is the opposite of what an auth email needs.
`;

writeFileSync(join(outDir, "README.md"), readme, "utf8");

console.log(`Wrote ${files.length} Supabase Auth templates + README → ${outDir}`);

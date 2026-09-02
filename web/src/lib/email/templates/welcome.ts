/**
 * Welcome email template (Resend). Sent once when onboarding starts after verified login.
 * CTA links to /onboarding. NOT used for Supabase Auth emails.
 *
 * Renders through the shared chrome in `../layout` so it looks like the rest of the
 * estate; the old version drew its own fake logo tile (a black square with a "D") and a
 * generic "Welcome to the family!" headline, which is exactly the kind of thing that
 * makes a paid product read as a template.
 */

import { renderEmail, steps, paragraph } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export function welcomeTemplate(locale: EmailLocale = "en"): { subject: string; html: string } {
  const t = emailCopy(locale, {
    en: { subject: "Your Denku workspace is ready", preheader: "Three short steps and your AI starts answering. It takes about two minutes.", eyebrow: "Welcome to Denku", heading: "Your workspace is ready", intro: "Your email is verified, so the only thing between you and an AI that answers every call is a short setup. Most businesses finish it in **under two minutes**.", next: "Here's what happens next:", steps: ["Tell us what your business does and how you want callers greeted.", "Choose a plan — your included US phone number comes with it.", "We provision the number and your AI starts answering, 24/7."], cta: "Start setup", signoff: "If anything is unclear, reply to this email — a person reads it.", reason: "You're receiving this because you created a Denku account with this address." },
    es: { subject: "Tu espacio de trabajo Denku está listo", preheader: "Tres pasos breves y tu IA empezará a responder. Solo lleva unos dos minutos.", eyebrow: "Te damos la bienvenida a Denku", heading: "Tu espacio de trabajo está listo", intro: "Tu correo ya está verificado. Solo falta una configuración breve para que tu IA responda cada llamada. La mayoría de los negocios tarda **menos de dos minutos**.", next: "Esto es lo que viene ahora:", steps: ["Cuéntanos a qué se dedica tu negocio y cómo quieres recibir a quienes llaman.", "Elige un plan; incluye un número de teléfono de EE. UU.", "Provisionamos el número y tu IA empieza a responder, 24/7."], cta: "Iniciar configuración", signoff: "Si algo no está claro, responde a este correo; lo leerá una persona.", reason: "Recibes este correo porque creaste una cuenta de Denku con esta dirección." },
    de: { subject: "Ihr Denku-Arbeitsbereich ist bereit", preheader: "Drei kurze Schritte, dann antwortet Ihre KI. Das dauert etwa zwei Minuten.", eyebrow: "Willkommen bei Denku", heading: "Ihr Arbeitsbereich ist bereit", intro: "Ihre E-Mail-Adresse ist bestätigt. Jetzt fehlt nur eine kurze Einrichtung, damit Ihre KI jeden Anruf beantwortet. Die meisten Unternehmen brauchen **weniger als zwei Minuten**.", next: "So geht es weiter:", steps: ["Beschreiben Sie Ihr Unternehmen und wie Anrufende begrüßt werden sollen.", "Wählen Sie einen Tarif – eine US-Telefonnummer ist enthalten.", "Wir stellen die Nummer bereit und Ihre KI antwortet rund um die Uhr."], cta: "Einrichtung starten", signoff: "Wenn etwas unklar ist, antworten Sie auf diese E-Mail – ein Mensch liest sie.", reason: "Sie erhalten diese E-Mail, weil mit dieser Adresse ein Denku-Konto erstellt wurde." },
    tr: { subject: "Denku çalışma alanınız hazır", preheader: "Üç kısa adımdan sonra yapay zekânız yanıtlamaya başlar. Yaklaşık iki dakika sürer.", eyebrow: "Denku'ya hoş geldiniz", heading: "Çalışma alanınız hazır", intro: "E-posta adresiniz doğrulandı. Her aramayı yanıtlayan yapay zekânız için yalnızca kısa bir kurulum kaldı. Çoğu işletme bunu **iki dakikadan kısa sürede** tamamlar.", next: "Sırada şunlar var:", steps: ["İşletmenizin ne yaptığını ve arayanların nasıl karşılanmasını istediğinizi anlatın.", "Bir plan seçin; ABD telefon numaranız plana dahildir.", "Numarayı hazırlarız ve yapay zekânız 7/24 yanıtlamaya başlar."], cta: "Kurulumu başlat", signoff: "Anlaşılmayan bir şey olursa bu e-postayı yanıtlayın; gerçek bir kişi okuyacak.", reason: "Bu e-postayı, bu adresle bir Denku hesabı oluşturduğunuz için alıyorsunuz." },
  });
  const subject = t.subject;
  const onboardingUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.denku.io"}/onboarding`;

  const html = renderEmail({
    locale,
    title: t.subject,
    preheader: t.preheader,
    eyebrow: t.eyebrow,
    heading: t.heading,
    intro: t.intro,
    blocks: [
      paragraph(t.next),
      steps(t.steps),
    ],
    cta: { label: t.cta, url: onboardingUrl },
    signoff: t.signoff,
    reason: t.reason,
  });

  return { subject, html };
}

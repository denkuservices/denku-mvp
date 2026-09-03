/**
 * Add-on change confirmation — extra phone numbers, extra simultaneous calls, or a chat
 * capacity tier.
 *
 * Add-ons change the bill and the capability at the same time, and until now they
 * changed both silently. This states the new effective limit (not just what was bought)
 * because "you now have 2 numbers" is the fact the customer actually needs; the delta on
 * its own tells them nothing about where they stand.
 */

import { renderEmail, detailList, notice } from "../layout";
import { emailCopy, type EmailLocale } from "../i18n";

export type AddonKey = "extra_phone" | "extra_concurrency" | "chat_basic" | "chat_standard";

const ADDON_LABEL: Record<AddonKey, string> = {
  extra_phone: "Additional phone number",
  extra_concurrency: "Additional simultaneous call",
  chat_basic: "Chat capacity — Basic",
  chat_standard: "Chat capacity — Standard",
};

/** Turkish nouns stay singular after a numeral, so one table serves every count. */
const ADDON_UNIT_TR: Record<AddonKey, string> = {
  extra_phone: "telefon numarası",
  extra_concurrency: "eş zamanlı arama",
  chat_basic: "sohbet kanalı",
  chat_standard: "sohbet kanalı",
};

const ADDON_UNIT: Record<AddonKey, string> = {
  extra_phone: "phone numbers",
  extra_concurrency: "simultaneous calls",
  chat_basic: "chat channels",
  chat_standard: "chat channels",
};

export interface AddonPurchasedParams {
  addonKey: AddonKey;
  /** Quantity after the change. */
  qty: number;
  /** Quantity before the change, so the mail can say what moved. */
  previousQty?: number | null;
  /** Effective total capability after the change (base plan + add-ons), when known. */
  effectiveTotal?: number | null;
  /**
   * When a dropped add-on actually stops (ISO). Present only for a scheduled downgrade.
   *
   * This is the whole reason the removal mail exists in its current form. Without the date the
   * mail says "we removed your extra number", the owner believes it is gone, and they stop using
   * capacity they have already paid for until the end of the period. The date is not a detail
   * here; it is the message.
   */
  endsAt?: string | null;
  orgName?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}

/** The end date in the customer's own language, as a date and never a timestamp. */
function formatEndsAt(iso: string, locale: EmailLocale): string {
  const tag = { en: "en-US", es: "es-ES", de: "de-DE", tr: "tr-TR" }[locale] ?? "en-US";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
}

export function addonPurchasedTemplate(params: AddonPurchasedParams): {
  subject: string;
  html: string;
} {
  const { addonKey, qty, previousQty, effectiveTotal, endsAt, orgName, billingUrl, locale = "en" } = params;
  const labels = emailCopy(locale, {
    en: ADDON_LABEL,
    es: { extra_phone: "Número de teléfono adicional", extra_concurrency: "Llamada simultánea adicional", chat_basic: "Capacidad de chat — Básica", chat_standard: "Capacidad de chat — Estándar" },
    de: { extra_phone: "Zusätzliche Telefonnummer", extra_concurrency: "Zusätzlicher gleichzeitiger Anruf", chat_basic: "Chat-Kapazität – Basic", chat_standard: "Chat-Kapazität – Standard" },
    tr: { extra_phone: "Ek telefon numarası", extra_concurrency: "Ek eş zamanlı arama", chat_basic: "Sohbet kapasitesi — Temel", chat_standard: "Sohbet kapasitesi — Standart" },
  });
  const units = emailCopy(locale, {
    en: ADDON_UNIT,
    es: { extra_phone: "números de teléfono", extra_concurrency: "llamadas simultáneas", chat_basic: "canales de chat", chat_standard: "canales de chat" },
    de: { extra_phone: "Telefonnummern", extra_concurrency: "gleichzeitige Anrufe", chat_basic: "Chat-Kanäle", chat_standard: "Chat-Kanäle" },
    tr: ADDON_UNIT_TR,
  });
  /**
   * The singular of each unit, because "1 phone numbers" is the kind of sentence that makes a
   * customer trust the number less than they should.
   *
   * Turkish has no entry: a Turkish noun after a numeral stays singular ("2 telefon numarası"), so
   * the plural table is already the right one for every count. Getting that wrong in the other
   * direction — adding "-lar" — would be worse than the English bug this fixes.
   */
  const unitsOne = emailCopy(locale, {
    en: {
      extra_phone: "phone number",
      extra_concurrency: "simultaneous call",
      chat_basic: "chat channel",
      chat_standard: "chat channel",
    },
    es: {
      extra_phone: "número de teléfono",
      extra_concurrency: "llamada simultánea",
      chat_basic: "canal de chat",
      chat_standard: "canal de chat",
    },
    de: {
      extra_phone: "Telefonnummer",
      extra_concurrency: "gleichzeitiger Anruf",
      chat_basic: "Chat-Kanal",
      chat_standard: "Chat-Kanal",
    },
    tr: ADDON_UNIT_TR,
  });

  const label = labels[addonKey];
  const unit = units[addonKey];
  /** `3 phone numbers`, `1 phone number` — one place, so every row agrees. */
  const withUnit = (count: number) =>
    `${count} ${count === 1 ? unitsOne[addonKey] : unit}`;
  const removed = typeof previousQty === "number" && qty < previousQty;
  /** A removal that has not happened yet — the customer keeps the capacity until this date. */
  const scheduled = removed && typeof endsAt === "string" && endsAt.length > 0;
  const endsAtLabel = scheduled ? formatEndsAt(endsAt as string, locale) : null;

  /**
   * Copy for the one case the original mail could not describe: a removal that takes effect later.
   *
   * Kept beside the existing strings rather than folded into them, because the two say opposite
   * things — "already in effect" versus "yours until the 14th" — and a shared sentence with a
   * conditional clause inside it is how one of them ends up wrong in three languages.
   */
  const s = emailCopy(locale, {
    en: {
      subject: "Your add-on ends at the end of this billing period",
      heading: "Nothing changes today",
      intro: `This add-on is paid for until ${endsAtLabel}, so it stays available until then and simply won't renew afterwards. There's no refund for the remaining days, and nothing to do in the meantime.`,
      until: "Available until",
      after: "After that",
      notice: "You can add it back before that date at no extra cost — the period is already paid for.",
      preheader: `${label} — available until ${endsAtLabel}.`,
    },
    es: {
      subject: "Tu complemento termina al final de este período de facturación",
      heading: "Hoy no cambia nada",
      intro: `Este complemento está pagado hasta el ${endsAtLabel}, así que seguirá disponible hasta esa fecha y simplemente no se renovará. No hay reembolso por los días restantes y no tienes que hacer nada mientras tanto.`,
      until: "Disponible hasta",
      after: "Después",
      notice: "Puedes volver a activarlo antes de esa fecha sin coste adicional: el período ya está pagado.",
      preheader: `${label} — disponible hasta el ${endsAtLabel}.`,
    },
    de: {
      subject: "Ihr Add-on endet zum Ende dieses Abrechnungszeitraums",
      heading: "Heute ändert sich nichts",
      intro: `Dieses Add-on ist bis zum ${endsAtLabel} bezahlt. Es bleibt bis dahin verfügbar und wird danach einfach nicht verlängert. Für die restlichen Tage gibt es keine Rückerstattung, und bis dahin ist nichts zu tun.`,
      until: "Verfügbar bis",
      after: "Danach",
      notice: "Sie können es vor diesem Datum ohne Zusatzkosten wieder aktivieren – der Zeitraum ist bereits bezahlt.",
      preheader: `${label} — verfügbar bis ${endsAtLabel}.`,
    },
    tr: {
      subject: "Eklentiniz bu fatura döneminin sonunda sona eriyor",
      heading: "Bugün hiçbir şey değişmiyor",
      intro: `Bu eklentinin ücreti ${endsAtLabel} tarihine kadar ödenmiş durumda; o tarihe kadar kullanmaya devam edebilirsiniz, sonrasında yenilenmeyecek. Kalan günler için iade yapılmaz ve bu süre içinde yapmanız gereken bir şey yok.`,
      until: "Şu tarihe kadar kullanılabilir",
      after: "Sonrasında",
      notice: "Bu tarihten önce ek ücret ödemeden geri ekleyebilirsiniz — dönem zaten ödenmiş durumda.",
      preheader: `${label} — ${endsAtLabel} tarihine kadar kullanılabilir.`,
    },
  });

  const t = emailCopy(locale, {
    en: { removedSubject: "Your Denku add-ons were updated", addedSubject: "Your workspace just got more capacity", now: "now", nextInvoice: "Your next invoice reflects the change.", active: "It's active immediately.", eyebrow: "Plan change", removedHeading: "Your add-ons were updated", addedHeading: "More capacity, effective now", hi: "Hi", removedIntro: "We've updated your add-ons. The change is already in effect and your next invoice will reflect it.", addedIntro: "Your add-on is active immediately — there's nothing to switch on.", addon: "Add-on", changed: "Changed", quantity: "Quantity", total: "You now have", notice: "Add-ons are billed with your subscription and are prorated by Stripe for the current period.", cta: "View billing", reason: "You're receiving this because your Denku add-ons changed. It's a billing confirmation, not marketing." },
    es: { removedSubject: "Se actualizaron tus complementos de Denku", addedSubject: "Tu espacio de trabajo ahora tiene más capacidad", now: "ahora", nextInvoice: "La próxima factura reflejará el cambio.", active: "Ya está activo.", eyebrow: "Cambio de plan", removedHeading: "Se actualizaron tus complementos", addedHeading: "Más capacidad, activa desde ahora", hi: "Hola", removedIntro: "Actualizamos tus complementos. El cambio ya está activo y aparecerá en la próxima factura.", addedIntro: "Tu complemento está activo de inmediato; no tienes que habilitar nada.", addon: "Complemento", changed: "Cambio", quantity: "Cantidad", total: "Ahora tienes", notice: "Los complementos se facturan con la suscripción y Stripe prorratea el período actual.", cta: "Ver facturación", reason: "Recibes este correo porque cambiaron tus complementos de Denku. Es una confirmación de facturación, no de marketing." },
    de: { removedSubject: "Ihre Denku-Add-ons wurden aktualisiert", addedSubject: "Ihr Arbeitsbereich hat jetzt mehr Kapazität", now: "jetzt", nextInvoice: "Die nächste Rechnung berücksichtigt die Änderung.", active: "Die Änderung ist sofort aktiv.", eyebrow: "Tarifänderung", removedHeading: "Ihre Add-ons wurden aktualisiert", addedHeading: "Mehr Kapazität, ab sofort", hi: "Hallo", removedIntro: "Wir haben Ihre Add-ons aktualisiert. Die Änderung gilt bereits und erscheint auf der nächsten Rechnung.", addedIntro: "Ihr Add-on ist sofort aktiv – Sie müssen nichts einschalten.", addon: "Add-on", changed: "Geändert", quantity: "Menge", total: "Sie haben jetzt", notice: "Add-ons werden mit Ihrem Abonnement abgerechnet und von Stripe für den aktuellen Zeitraum anteilig berechnet.", cta: "Abrechnung ansehen", reason: "Sie erhalten diese E-Mail, weil sich Ihre Denku-Add-ons geändert haben. Dies ist eine Abrechnungsbestätigung, keine Werbung." },
    tr: { removedSubject: "Denku eklentileriniz güncellendi", addedSubject: "Çalışma alanınızın kapasitesi artırıldı", now: "şimdi", nextInvoice: "Değişiklik sonraki faturanıza yansır.", active: "Hemen etkinleşti.", eyebrow: "Plan değişikliği", removedHeading: "Eklentileriniz güncellendi", addedHeading: "Daha fazla kapasite hemen etkin", hi: "Merhaba", removedIntro: "Eklentilerinizi güncelledik. Değişiklik zaten yürürlükte ve sonraki faturanıza yansıyacak.", addedIntro: "Eklentiniz hemen etkinleşti; açmanız gereken başka bir şey yok.", addon: "Eklenti", changed: "Değişiklik", quantity: "Adet", total: "Artık sahip olduğunuz", notice: "Eklentiler aboneliğinizle birlikte faturalandırılır ve Stripe tarafından mevcut dönem için orantılı hesaplanır.", cta: "Faturalandırmayı görüntüle", reason: "Bu e-postayı Denku eklentileriniz değiştiği için alıyorsunuz. Bu bir faturalandırma onayıdır, pazarlama değildir." },
  });
  const subject = scheduled ? s.subject : removed ? t.removedSubject : t.addedSubject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: scheduled
      ? s.preheader
      : removed
        ? `${label} — ${t.now} ${qty}. ${t.nextInvoice}`
        : `${label} — ${t.now} ${qty}. ${t.active}`,
    eyebrow: t.eyebrow,
    heading: scheduled ? s.heading : removed ? t.removedHeading : t.addedHeading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: removed ? "neutral" : "positive",
    intro: scheduled ? s.intro : removed ? t.removedIntro : t.addedIntro,
    blocks: [
      detailList([
        { label: t.addon, value: label, strong: true },
        // On a scheduled removal the arrow would lie about WHEN: the customer still has the old
        // quantity today. The two dated rows say what is true now and what is true later.
        /**
         * What they will have AFTER, expressed as the whole capability and not as the add-on.
         *
         * "After that: 0 phone numbers" was true about the add-on and terrifying about the
         * product — the plan's own included number is still there. This row therefore counts the
         * same thing as the "you now have" row below it, so the two can be read together.
         */
        ...(scheduled
          ? [
              { label: s.until, value: `${endsAtLabel}`, strong: true },
              ...(typeof effectiveTotal === "number" && typeof previousQty === "number"
                ? [
                    {
                      label: s.after,
                      value: withUnit(Math.max(0, effectiveTotal - (previousQty - qty))),
                    },
                  ]
                : []),
            ]
          : typeof previousQty === "number" && previousQty !== qty
            ? [{ label: t.changed, value: `${previousQty} → ${qty}` }]
            : [{ label: t.quantity, value: String(qty) }]),
        ...(typeof effectiveTotal === "number"
          ? [{ label: t.total, value: withUnit(effectiveTotal), strong: true }]
          : []),
      ]),
      notice(scheduled ? s.notice : t.notice, "neutral"),
    ],
    cta: { label: t.cta, url: billingUrl },
    reason: t.reason,
  });

  return { subject, html };
}

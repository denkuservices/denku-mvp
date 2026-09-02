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
  orgName?: string | null;
  billingUrl: string;
  locale?: EmailLocale;
}

export function addonPurchasedTemplate(params: AddonPurchasedParams): {
  subject: string;
  html: string;
} {
  const { addonKey, qty, previousQty, effectiveTotal, orgName, billingUrl, locale = "en" } = params;
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
    tr: { extra_phone: "telefon numarası", extra_concurrency: "eş zamanlı arama", chat_basic: "sohbet kanalı", chat_standard: "sohbet kanalı" },
  });
  const label = labels[addonKey];
  const unit = units[addonKey];
  const removed = typeof previousQty === "number" && qty < previousQty;

  const t = emailCopy(locale, {
    en: { removedSubject: "Your Denku add-ons were updated", addedSubject: "Your workspace just got more capacity", now: "now", nextInvoice: "Your next invoice reflects the change.", active: "It's active immediately.", eyebrow: "Plan change", removedHeading: "Your add-ons were updated", addedHeading: "More capacity, effective now", hi: "Hi", removedIntro: "We've updated your add-ons. The change is already in effect and your next invoice will reflect it.", addedIntro: "Your add-on is active immediately — there's nothing to switch on.", addon: "Add-on", changed: "Changed", quantity: "Quantity", total: "You now have", notice: "Add-ons are billed with your subscription and are prorated by Stripe for the current period.", cta: "View billing", reason: "You're receiving this because your Denku add-ons changed. It's a billing confirmation, not marketing." },
    es: { removedSubject: "Se actualizaron tus complementos de Denku", addedSubject: "Tu espacio de trabajo ahora tiene más capacidad", now: "ahora", nextInvoice: "La próxima factura reflejará el cambio.", active: "Ya está activo.", eyebrow: "Cambio de plan", removedHeading: "Se actualizaron tus complementos", addedHeading: "Más capacidad, activa desde ahora", hi: "Hola", removedIntro: "Actualizamos tus complementos. El cambio ya está activo y aparecerá en la próxima factura.", addedIntro: "Tu complemento está activo de inmediato; no tienes que habilitar nada.", addon: "Complemento", changed: "Cambio", quantity: "Cantidad", total: "Ahora tienes", notice: "Los complementos se facturan con la suscripción y Stripe prorratea el período actual.", cta: "Ver facturación", reason: "Recibes este correo porque cambiaron tus complementos de Denku. Es una confirmación de facturación, no de marketing." },
    de: { removedSubject: "Ihre Denku-Add-ons wurden aktualisiert", addedSubject: "Ihr Arbeitsbereich hat jetzt mehr Kapazität", now: "jetzt", nextInvoice: "Die nächste Rechnung berücksichtigt die Änderung.", active: "Die Änderung ist sofort aktiv.", eyebrow: "Tarifänderung", removedHeading: "Ihre Add-ons wurden aktualisiert", addedHeading: "Mehr Kapazität, ab sofort", hi: "Hallo", removedIntro: "Wir haben Ihre Add-ons aktualisiert. Die Änderung gilt bereits und erscheint auf der nächsten Rechnung.", addedIntro: "Ihr Add-on ist sofort aktiv – Sie müssen nichts einschalten.", addon: "Add-on", changed: "Geändert", quantity: "Menge", total: "Sie haben jetzt", notice: "Add-ons werden mit Ihrem Abonnement abgerechnet und von Stripe für den aktuellen Zeitraum anteilig berechnet.", cta: "Abrechnung ansehen", reason: "Sie erhalten diese E-Mail, weil sich Ihre Denku-Add-ons geändert haben. Dies ist eine Abrechnungsbestätigung, keine Werbung." },
    tr: { removedSubject: "Denku eklentileriniz güncellendi", addedSubject: "Çalışma alanınızın kapasitesi artırıldı", now: "şimdi", nextInvoice: "Değişiklik sonraki faturanıza yansır.", active: "Hemen etkinleşti.", eyebrow: "Plan değişikliği", removedHeading: "Eklentileriniz güncellendi", addedHeading: "Daha fazla kapasite hemen etkin", hi: "Merhaba", removedIntro: "Eklentilerinizi güncelledik. Değişiklik zaten yürürlükte ve sonraki faturanıza yansıyacak.", addedIntro: "Eklentiniz hemen etkinleşti; açmanız gereken başka bir şey yok.", addon: "Eklenti", changed: "Değişiklik", quantity: "Adet", total: "Artık sahip olduğunuz", notice: "Eklentiler aboneliğinizle birlikte faturalandırılır ve Stripe tarafından mevcut dönem için orantılı hesaplanır.", cta: "Faturalandırmayı görüntüle", reason: "Bu e-postayı Denku eklentileriniz değiştiği için alıyorsunuz. Bu bir faturalandırma onayıdır, pazarlama değildir." },
  });
  const subject = removed ? t.removedSubject : t.addedSubject;

  const html = renderEmail({
    locale,
    title: subject,
    preheader: removed
      ? `${label} — ${t.now} ${qty}. ${t.nextInvoice}`
      : `${label} — ${t.now} ${qty}. ${t.active}`,
    eyebrow: t.eyebrow,
    heading: removed ? t.removedHeading : t.addedHeading,
    greeting: orgName ? `${t.hi} ${orgName},` : `${t.hi},`,
    tone: removed ? "neutral" : "positive",
    intro: removed
      ? t.removedIntro
      : t.addedIntro,
    blocks: [
      detailList([
        { label: t.addon, value: label, strong: true },
        ...(typeof previousQty === "number" && previousQty !== qty
          ? [{ label: t.changed, value: `${previousQty} → ${qty}` }]
          : [{ label: t.quantity, value: String(qty) }]),
        ...(typeof effectiveTotal === "number"
          ? [{ label: t.total, value: `${effectiveTotal} ${unit}`, strong: true }]
          : []),
      ]),
      notice(
        t.notice,
        "neutral"
      ),
    ],
    cta: { label: t.cta, url: billingUrl },
    reason: t.reason,
  });

  return { subject, html };
}

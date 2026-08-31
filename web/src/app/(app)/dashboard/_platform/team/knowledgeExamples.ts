/**
 * Placeholder examples, chosen by where the person actually is.
 *
 * The first version shipped one set written around a clinic in Kadıköy. To an owner in Ohio that
 * is not a helpful example, it is a product that looks like it was built for somewhere else — and
 * a placeholder's whole job is to show the SHAPE of a good answer, which it cannot do while the
 * reader is busy noticing it does not apply to them.
 *
 * The region comes from the browser's own timezone, the same source the timezone picker uses. No
 * IP lookup, nothing sent anywhere: it is the zone the person's device is set to.
 *
 * These are examples, never defaults. Nothing here is ever written into a field — an example that
 * silently became data would be exactly the invented fact this product refuses everywhere else.
 */

export type KnowledgeExamples = {
  businessName: string;
  services: string;
  openingHours: string;
  serviceArea: string;
  faqs: string;
  bookingPolicy: string;
  cancellationPolicy: string;
  tone: string;
};

const TR: KnowledgeExamples = {
  businessName: "Kadıköy Diş Kliniği",
  services: "Diş temizliği, dolgu, kanal tedavisi, implant ve beyazlatma. İlk muayene ücretsiz.",
  openingHours: "Pzt–Cum 09:00–18:00, Cmt 10:00–14:00, Pazar kapalı",
  serviceArea: "Kadıköy, İstanbul — tek klinik",
  faqs: "Anlaşmalı kurumlarınız var mı? — Özel sağlık sigortalarının çoğuyla çalışıyoruz.\nOtopark var mı? — Evet, hastalarımıza ücretsiz.",
  bookingPolicy: "En az bir gün önceden randevu alın. Aynı gün için iptallere bağlı.",
  cancellationPolicy: "24 saat önceden haber verin, aksi halde muayene ücretinin yarısı yansıtılır.",
  tone: "Sıcak ve güven verici — arayanların çoğu diş hekiminden çekiniyor.",
};

const US: KnowledgeExamples = {
  businessName: "Riverside Dental",
  services: "Cleanings, fillings, root canals, implants and whitening. First consultation is free.",
  openingHours: "Mon–Fri 9:00–6:00, Sat 10:00–2:00, closed Sunday",
  serviceArea: "One office in Columbus, OH",
  faqs: "Do you take insurance? — Yes, most PPO plans.\nIs there parking? — Yes, free for patients.",
  bookingPolicy: "Book at least a day ahead. Same-day slots depend on cancellations.",
  cancellationPolicy: "24 hours' notice, otherwise half the visit fee is charged.",
  tone: "Warm and reassuring — a lot of callers are nervous about the dentist.",
};

const EU: KnowledgeExamples = {
  businessName: "Rivergate Dental",
  services: "Cleanings, fillings, root canals, implants and whitening. First consultation is free.",
  openingHours: "Mon–Fri 9:00–18:00, Sat 10:00–14:00, closed Sunday",
  serviceArea: "One practice in central Amsterdam",
  faqs: "Do you take insurance? — Yes, most private plans.\nIs there parking? — Yes, free for patients.",
  bookingPolicy: "Book at least a day ahead. Same-day slots depend on cancellations.",
  cancellationPolicy: "24 hours' notice, otherwise half the visit fee is charged.",
  tone: "Warm and reassuring — a lot of callers are nervous about the dentist.",
};

const ES: KnowledgeExamples = {
  businessName: "Clínica Dental Riera",
  services: "Limpiezas, empastes, endodoncias, implantes y blanqueamiento. Primera visita gratuita.",
  openingHours: "Lun–Vie 9:00–18:00, Sáb 10:00–14:00, domingo cerrado",
  serviceArea: "Una clínica en Barcelona",
  faqs: "¿Trabajáis con seguros? — Sí, con la mayoría de seguros privados.\n¿Hay aparcamiento? — Sí, gratuito para pacientes.",
  bookingPolicy: "Pide cita con al menos un día de antelación. El mismo día depende de las cancelaciones.",
  cancellationPolicy: "Avisa con 24 horas, si no se cobra la mitad de la visita.",
  tone: "Cercano y tranquilizador — mucha gente viene con miedo al dentista.",
};

/**
 * Pick a set from an IANA timezone.
 *
 * Deliberately coarse. The point is that the example does not feel foreign, not that it names the
 * reader's own street — four buckets do that, and a longer table would be more to keep true.
 */
export function examplesForTimezone(timezone: string | null | undefined): KnowledgeExamples {
  const tz = (timezone ?? "").trim();
  if (!tz) return US;

  if (tz === "Europe/Istanbul" || tz === "Asia/Istanbul") return TR;
  if (tz === "Europe/Madrid" || tz.startsWith("America/Mexico") || tz.startsWith("America/Bogota"))
    return ES;
  if (tz.startsWith("Europe/") || tz.startsWith("Africa/")) return EU;
  if (tz.startsWith("America/") || tz.startsWith("US/") || tz.startsWith("Canada/")) return US;

  return EU;
}

export { TR as TR_EXAMPLES, US as US_EXAMPLES, EU as EU_EXAMPLES, ES as ES_EXAMPLES };

import type { Locale } from "./routing";

type DashboardDictionary = Readonly<Record<string, string>>;

const unitCopy = {
  es: { minute: "minuto", minutes: "minutos", hour: "hora", hours: "horas", day: "día", days: "días", month: "mes", months: "meses" },
  de: { minute: "Minute", minutes: "Minuten", hour: "Stunde", hours: "Stunden", day: "Tag", days: "Tage", month: "Monat", months: "Monate" },
  tr: { minute: "dakika", minutes: "dakika", hour: "saat", hours: "saat", day: "gün", days: "gün", month: "ay", months: "ay" },
} as const;

const monthCopy = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
} as const;

const englishMonths = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function localizeClockLabel(value: string, locale: Exclude<Locale, "en">): string {
  const dayCopy = {
    es: { Mon: "lun", Tue: "mar", Wed: "mié", Thu: "jue", Fri: "vie", Sat: "sáb", Sun: "dom", AM: "a. m.", PM: "p. m." },
    de: { Mon: "Mo", Tue: "Di", Wed: "Mi", Thu: "Do", Fri: "Fr", Sat: "Sa", Sun: "So", AM: "vorm.", PM: "nachm." },
    tr: { Mon: "Pzt", Tue: "Sal", Wed: "Çar", Thu: "Per", Fri: "Cum", Sat: "Cmt", Sun: "Paz", AM: "ÖÖ", PM: "ÖS" },
  } as const;
  return value.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|AM|PM)\b/g, (part) =>
    dayCopy[locale][part as keyof typeof dayCopy[typeof locale]],
  );
}

function replaceMatch(
  source: string,
  pattern: RegExp,
  replacements: Partial<Record<Exclude<Locale, "en">, (...parts: string[]) => string>>,
  locale: Exclude<Locale, "en">,
  /**
   * An extra condition on the captured groups. A rule whose pattern ends in `(.+)` matches far
   * more than it was written for, and a rule that MANGLES a string is worse than one that leaves
   * it English: the coverage test counts any change as a translation, so the broken output is
   * invisible to it and ships. Where a capture is meant to be workspace data, say so here.
   */
  guard?: (...parts: string[]) => boolean,
): string | null {
  const match = source.match(pattern);
  const replacement = replacements[locale];
  if (!match || !replacement) return null;
  const parts = match.slice(1);
  if (guard && !guard(...parts)) return null;
  return replacement(...parts);
}

/**
 * Does this capture look like DATA the workspace supplied — a person's name, a handle, a phone
 * number, a line name — rather than English prose the source happened to write?
 *
 * `Select|Open|Call|View details for (.+)` exists for aria-labels built around a value:
 * `Call ${contact.primaryHandle}`, `View details for ${line.display_name}`. Every real call site
 * interpolates data. But `(.+)` also matched ordinary sentences sitting in the source, and did —
 * "Select plan" became "plan kişisini seç" ("select the person named plan"), "Open the call"
 * became "the call kaydını aç", and "Call your AI now" became "your AI now kişisini ara" on the
 * last screen of onboarding.
 */
function looksLikeDataValue(value: string, dictionary: DashboardDictionary): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/[.!?]$/.test(v)) return false;                            // a sentence, not a name
  if (dictionary[v] !== undefined) return true;                  // a term we already translate
  if (/^@/.test(v)) return true;                                 // a handle
  if (/^\+?\d[\d\s()-]{5,}$/.test(v)) return true;               // a phone number
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;         // an email
  const words = v.split(/\s+/);
  if (words.length > 4) return false;
  // A name reads as a name: every word starts with a capital or a digit.
  return words.every((w) => /^[\p{Lu}\p{N}]/u.test(w));
}

/**
 * `(.+) connected` is produced in exactly one place — a joined list of channel labels
 * (`workspaceLaunchpadModel.ts`). It also matched two static labels that mean the opposite or
 * nothing at all: "Not connected", on three channel cards, became "Not bağlı", and onboarding's
 * "Your AI is connected" became "Your AI is bağlı". Prose gives itself away with a copula or a
 * negation; a channel list never contains one.
 */
function looksLikeChannelList(value: string): boolean {
  return !/\b(is|are|was|were|not|Not|No|isn't|aren't)\b/.test(value.trim());
}

/**
 * Translates dashboard copy that contains workspace data or changing counters.
 * Rules deliberately cover only known UI templates; arbitrary customer content is never guessed at.
 */
export function translateDashboardCopy(
  rawSource: string,
  dictionary: DashboardDictionary,
  locale: Locale,
): string {
  const source = rawSource.replace(/\s+/g, " ").trim();
  if (!source || locale === "en") return rawSource;

  const exact = dictionary[source];
  if (exact) return exact;

  const targetLocale = locale as Exclude<Locale, "en">;
  const localizeList = (value: string) =>
    value
      .split(", ")
      .map((part) => dictionary[part] ?? part)
      .join(", ");
  /** A list the product joined with " or " — each item translated, the joiner localised. */
  const localizeChoices = (value: string, joiner: string) =>
    value
      .split(" or ")
      .map((part) => dictionary[part] ?? part)
      .join(` ${joiner} `);

  const rules: Array<string | null> = [
    replaceMatch(
      source,
      /^Your AI has answered (\d+) conversations? without knowing anything about your business\.$/,
      {
        es: (count) =>
          `Tu IA ha respondido ${count} ${count === "1" ? "conversación" : "conversaciones"} sin saber nada sobre tu negocio.`,
        de: (count) =>
          `Ihre KI hat ${count} ${count === "1" ? "Unterhaltung" : "Unterhaltungen"} beantwortet, ohne irgendetwas über Ihr Unternehmen zu wissen.`,
        tr: (count) =>
          `Yapay zekânız, işletmeniz hakkında hiçbir şey bilmeden ${count} konuşmayı yanıtladı.`,
      },
      targetLocale,
    ),
    replaceMatch(
      source,
      /^You are paying for (\d+) chat channels? and using (\d+)\.$/,
      {
        es: (slots, used) =>
          `Estás pagando por ${slots} ${slots === "1" ? "canal" : "canales"} de chat y usas ${used}.`,
        de: (slots, used) =>
          `Sie bezahlen für ${slots} Chat-${slots === "1" ? "Kanal" : "Kanäle"} und nutzen davon ${used}.`,
        tr: (slots, used) => `${slots} sohbet kanalı için ödeme yapıyor, ${used} tanesini kullanıyorsunuz.`,
      },
      targetLocale,
    ),
    replaceMatch(source, /^Handled by (.+)$/, {
      es: (employee) => `Gestionado por ${employee}`,
      de: (employee) => `Bearbeitet von ${employee}`,
      tr: (employee) => `${employee} yönetti`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) requests?$/, {
      es: (count) => `${count} ${count === "1" ? "solicitud" : "solicitudes"}`,
      de: (count) => `${count} ${count === "1" ? "Anfrage" : "Anfragen"}`,
      tr: (count) => `${count} talep`,
    }, targetLocale),
    replaceMatch(
      source,
      /^(\d+) active sessions?\. Sign out of any you don't recognise\.$/,
      {
        es: (count) =>
          `${count} ${count === "1" ? "sesión activa" : "sesiones activas"}. Cierra las que no reconozcas.`,
        de: (count) =>
          `${count} aktive ${count === "1" ? "Sitzung" : "Sitzungen"}. Melden Sie alles ab, was Sie nicht wiedererkennen.`,
        tr: (count) => `${count} etkin oturum. Tanımadığınız varsa oturumunu kapatın.`,
      },
      targetLocale,
    ),
    replaceMatch(source, /^(Add|Remove) one (.+)$/, {
      es: (verb, addon) =>
        `${verb === "Add" ? "Añadir uno" : "Quitar uno"}: ${dictionary[addon] ?? addon}`,
      de: (verb, addon) =>
        `${verb === "Add" ? "Eins hinzufügen" : "Eins entfernen"}: ${dictionary[addon] ?? addon}`,
      tr: (verb, addon) =>
        `${dictionary[addon] ?? addon}: bir ${verb === "Add" ? "ekle" : "çıkar"}`,
    }, targetLocale),
    /*
     * The employee's capability line on the channels tab — four verbs joined with " · ".
     * Matched as a whole and mapped token by token so the joiner survives; the alternation is
     * closed on purpose, so this can never fire on a customer's own text.
     */
    replaceMatch(
      source,
      /^((?:answer|reply|book & log|escalate)(?: · (?:answer|reply|book & log|escalate))*)$/,
      {
        es: (list) => list.split(" · ").map((verb) => dictionary[verb] ?? verb).join(" · "),
        de: (list) => list.split(" · ").map((verb) => dictionary[verb] ?? verb).join(" · "),
        tr: (list) => list.split(" · ").map((verb) => dictionary[verb] ?? verb).join(" · "),
      },
      targetLocale,
    ),
    replaceMatch(source, /^On calls it only speaks (.+)\.$/, {
      es: (language) => `En las llamadas solo habla ${dictionary[language] ?? language}.`,
      de: (language) => `Bei Anrufen spricht sie nur ${dictionary[language] ?? language}.`,
      tr: (language) => `Aramalarda yalnızca ${dictionary[language] ?? language} konuşur.`,
    }, targetLocale),
    replaceMatch(
      source,
      /^It starts every call in (.+?) and switches if the caller speaks (.+)\.$/,
      {
        es: (primary, others) =>
          `Empieza cada llamada en ${dictionary[primary] ?? primary} y cambia si quien llama habla ${localizeChoices(others, "o")}.`,
        de: (primary, others) =>
          `Sie beginnt jeden Anruf auf ${dictionary[primary] ?? primary} und wechselt, wenn der Anrufer ${localizeChoices(others, "oder")} spricht.`,
        tr: (primary, others) =>
          `Her aramaya ${dictionary[primary] ?? primary} dilinde başlar; arayan ${localizeChoices(others, "veya")} konuşursa o dile geçer.`,
      },
      targetLocale,
    ),
    replaceMatch(
      source,
      /^Tick any language it should answer in besides (.+?)\. The first tick switches listening from \1 alone to code-switching, which is slightly less accurate for \1\. Ticking more after that costs nothing extra\.$/,
      {
        es: (language) => {
          const name = dictionary[language] ?? language;
          return `Marca cualquier idioma en el que deba responder además de ${name}. La primera marca cambia la escucha de solo ${name} a cambio de idioma, lo que es algo menos preciso para ${name}. Marcar más después no cuesta nada.`;
        },
        de: (language) => {
          const name = dictionary[language] ?? language;
          return `Wählen Sie jede weitere Sprache aus, in der sie neben ${name} antworten soll. Die erste Auswahl stellt das Zuhören von nur ${name} auf Sprachwechsel um, was für ${name} etwas ungenauer ist. Weitere kosten danach nichts extra.`;
        },
        tr: (language) => {
          const name = dictionary[language] ?? language;
          return `${name} dışında yanıt vermesini istediğiniz dilleri işaretleyin. İlk işaret, dinlemeyi yalnızca ${name} yerine diller arası geçişe alır; bu ${name} için biraz daha az isabetlidir. Sonrasında daha fazlasını işaretlemek ek maliyet getirmez.`;
        },
      },
      targetLocale,
    ),
    replaceMatch(source, /^Voices that speak (.+?) — (.+)$/, {
      es: (language, legend) =>
        `Voces que hablan ${dictionary[language] ?? language} — ${dictionary[legend] ?? legend}`,
      de: (language, legend) =>
        `Stimmen, die ${dictionary[language] ?? language} sprechen – ${dictionary[legend] ?? legend}`,
      tr: (language, legend) =>
        `${dictionary[language] ?? language} konuşan sesler — ${dictionary[legend] ?? legend}`,
    }, targetLocale),
    replaceMatch(source, /^Humanness (\d)\/5 — (.+?)\. (.+)$/, {
      es: (score, label, legend) =>
        `Naturalidad ${score}/5 — ${dictionary[label] ?? label}. ${dictionary[legend] ?? legend}`,
      de: (score, label, legend) =>
        `Natürlichkeit ${score}/5 – ${dictionary[label] ?? label}. ${dictionary[legend] ?? legend}`,
      tr: (score, label, legend) =>
        `Doğallık ${score}/5 — ${dictionary[label] ?? label}. ${dictionary[legend] ?? legend}`,
    }, targetLocale),
    replaceMatch(source, /^Humanness (\d) out of 5, (.+)$/, {
      es: (score, label) => `Naturalidad ${score} de 5, ${dictionary[label] ?? label}`,
      de: (score, label) => `Natürlichkeit ${score} von 5, ${dictionary[label] ?? label}`,
      tr: (score, label) => `Doğallık 5 üzerinden ${score}, ${dictionary[label] ?? label}`,
    }, targetLocale),
    replaceMatch(source, /^About (\d+) min left$/, {
      es: (amount) => `Quedan unos ${amount} min`,
      de: (amount) => `Noch etwa ${amount} Min.`,
      tr: (amount) => `Yaklaşık ${amount} dk kaldı`,
    }, targetLocale),
    replaceMatch(source, /^Let's get (.+) ready for its first customer\.$/, {
      es: (name) => `Preparemos ${name} para su primer cliente.`,
      de: (name) => `Machen wir ${name} bereit für den ersten Kunden.`,
      tr: (name) => `${name} çalışma alanını ilk müşterisine hazırlayalım.`,
    }, targetLocale),
    replaceMatch(source, /^Business: (.+)$/, {
      es: (name) => `Negocio: ${name}`,
      de: (name) => `Unternehmen: ${name}`,
      tr: (name) => `İşletme: ${name}`,
    }, targetLocale),
    replaceMatch(source, /^Language: (.+)$/, {
      es: (language) => `Idioma: ${dictionary[language] ?? language}`,
      de: (language) => `Sprache: ${dictionary[language] ?? language}`,
      tr: (language) => `Dil: ${dictionary[language] ?? language}`,
    }, targetLocale),
    replaceMatch(source, /^(.+) · (connected|getting ready)$/, {
      es: (name, state) => `${name} · ${state === "connected" ? "conectado" : "preparándose"}`,
      de: (name, state) => `${name} · ${state === "connected" ? "verbunden" : "wird vorbereitet"}`,
      tr: (name, state) => `${name} · ${state === "connected" ? "bağlı" : "hazırlanıyor"}`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) of (\d+) complete$/, {
      es: (done, total) => `${total} de ${done} completados`,
      de: (done, total) => `${done} von ${total} erledigt`,
      tr: (done, total) => `${total} adımdan ${done} tanesi tamamlandı`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) minute mission$/, {
      es: (amount) => `Misión de ${amount} min`,
      de: (amount) => `${amount}-Minuten-Aufgabe`,
      tr: (amount) => `${amount} dakikalık görev`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) min$/, {
      es: (amount) => `${amount} min`,
      de: (amount) => `${amount} Min.`,
      tr: (amount) => `${amount} dk`,
    }, targetLocale),
    replaceMatch(source, /^Make (.+) sound like you$/, {
      es: (name) => `Haz que ${name} suene como tu marca`,
      de: (name) => `${name} an Ihre Marke anpassen`,
      tr: (name) => `${name} sizin gibi konuşsun`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)\/6 useful knowledge areas filled$/, {
      es: (amount) => `Se completaron ${amount}/6 áreas de conocimiento útiles`,
      de: (amount) => `${amount}/6 nützliche Wissensbereiche ausgefüllt`,
      tr: (amount) => `6 yararlı bilgi alanından ${amount} tanesi dolu`,
    }, targetLocale),
    /*
     * The onboarding wizard's chrome, assembled around a step label. These three are the only
     * strings a Turkish customer still met in English after the dictionary pass, and no source
     * scan could have found them: they exist only once React has joined a number, a separator
     * and a label together. Found by running this boundary over the rendered markup of all nine
     * onboarding screens (2026-09-09).
     *
     * The label is guarded to a step name we actually translate, so these cannot start
     * swallowing prose the way `Select|Open|Call (.+)` did.
     */
    replaceMatch(source, /^Back to (.+)$/, {
      /*
       * A colon rather than a preposition, in all three. The label is a step name and two of
       * the six are clauses, not nouns: "Zurück zu" wants the dative ("zu Ihrem Unternehmen")
       * and cannot get it from a variable, "Volver a Qué responde" reads like a broken
       * sentence, and "X adımına dön" only works after a noun. A colon is what a back button
       * says anyway, and it takes any label.
       */
      es: (label) => `Volver a: ${dictionary[label] ?? label}`,
      de: (label) => `Zurück: ${dictionary[label] ?? label}`,
      tr: (label) => `Geri: ${dictionary[label] ?? label}`,
    }, targetLocale, (label) => dictionary[label] !== undefined),
    replaceMatch(source, /^Step (\d+) of (\d+) · (.+)$/, {
      es: (n, total, label) => `Paso ${n} de ${total} · ${dictionary[label] ?? label}`,
      de: (n, total, label) => `Schritt ${n} von ${total} · ${dictionary[label] ?? label}`,
      tr: (n, total, label) => `Adım ${n}/${total} · ${dictionary[label] ?? label}`,
    }, targetLocale, (_n, _total, label) => dictionary[label] !== undefined),
    replaceMatch(source, /^Pick any (\d+) of these$/, {
      es: (count) => `Elige ${count} de estos`,
      de: (count) => `Wählen Sie ${count} davon`,
      tr: (count) => `Bunlardan ${count} tanesini seçin`,
    }, targetLocale),
    replaceMatch(source, /^(.+) connected$/, {
      es: (channels) => `${localizeList(channels)} conectados`,
      de: (channels) => `${localizeList(channels)} verbunden`,
      tr: (channels) => `${localizeList(channels)} bağlı`,
    }, targetLocale, looksLikeChannelList),
    replaceMatch(source, /^(\d+) people have access$/, {
      es: (amount) => `${amount} personas tienen acceso`,
      de: (amount) => `${amount} Personen haben Zugriff`,
      tr: (amount) => `${amount} kişinin erişimi var`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)([smhdw]) ago$/, {
      es: (amount, unit) => `hace ${amount}${unit}`,
      de: (amount, unit) => `vor ${amount}${unit}`,
      tr: (amount, unit) => `${amount}${unit} önce`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) (minute|minutes|hour|hours|day|days|month|months) ago$/, {
      es: (amount, unit) => `hace ${amount} ${unitCopy.es[unit as keyof typeof unitCopy.es]}`,
      de: (amount, unit) => `vor ${amount} ${unitCopy.de[unit as keyof typeof unitCopy.de]}`,
      tr: (amount, unit) => `${amount} ${unitCopy.tr[unit as keyof typeof unitCopy.tr]} önce`,
    }, targetLocale),
    replaceMatch(source, /^(\d+(?:[.,]\d+)?)% of your CRM$/, {
      es: (amount) => `${amount}% de tu CRM`,
      de: (amount) => `${amount} % Ihres CRM`,
      tr: (amount) => `CRM'inizin %${amount}'i`,
    }, targetLocale),
    replaceMatch(source, /^(\d+(?:[.,]\d+)?)% of included minutes used$/, {
      es: (amount) => `${amount}% de los minutos incluidos usados`,
      de: (amount) => `${amount} % der enthaltenen Minuten genutzt`,
      tr: (amount) => `Dahil dakikaların %${amount}'i kullanıldı`,
    }, targetLocale),
    replaceMatch(source, /^([\d,.]+) minutes (remaining|handled)$/, {
      es: (amount, state) => `${amount} minutos ${state === "remaining" ? "restantes" : "gestionados"}`,
      de: (amount, state) => `${amount} Minuten ${state === "remaining" ? "verbleibend" : "bearbeitet"}`,
      tr: (amount, state) => `${amount} dakika ${state === "remaining" ? "kaldı" : "yönetildi"}`,
    }, targetLocale),
    replaceMatch(source, /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/, {
      es: (month, year) => `${monthCopy.es[englishMonths.indexOf(month as typeof englishMonths[number])]} de ${year}`,
      de: (month, year) => `${monthCopy.de[englishMonths.indexOf(month as typeof englishMonths[number])]} ${year}`,
      tr: (month, year) => `${monthCopy.tr[englishMonths.indexOf(month as typeof englishMonths[number])]} ${year}`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) (created|still upcoming|cancelled or no-show)$/, {
      es: (amount, state) => `${amount} ${state === "created" ? "creadas" : state === "still upcoming" ? "aún próximas" : "canceladas o ausencias"}`,
      de: (amount, state) => `${amount} ${state === "created" ? "erstellt" : state === "still upcoming" ? "noch bevorstehend" : "storniert oder nicht erschienen"}`,
      tr: (amount, state) => `${amount} ${state === "created" ? "oluşturuldu" : state === "still upcoming" ? "hâlâ yaklaşan" : "iptal veya gelmedi"}`,
    }, targetLocale),
    replaceMatch(source, /^([\d,.]+) open requests waiting on you$/, {
      es: (amount) => `${amount} solicitudes abiertas te esperan`,
      de: (amount) => `${amount} offene Anfragen warten auf Sie`,
      tr: (amount) => `Sizi bekleyen ${amount} açık talep`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) active sessions\. Sign out of any you don't recognise\.$/, {
      es: (amount) => `${amount} sesiones activas. Cierra las que no reconozcas.`,
      de: (amount) => `${amount} aktive Sitzungen. Melden Sie unbekannte Sitzungen ab.`,
      tr: (amount) => `${amount} aktif oturum. Tanımadıklarınızdan çıkış yapın.`,
    }, targetLocale),
    replaceMatch(source, /^Notifications, (\d+) need attention$/, {
      es: (amount) => `Notificaciones, ${amount} requieren atención`,
      de: (amount) => `Benachrichtigungen, ${amount} erfordern Aufmerksamkeit`,
      tr: (amount) => `Bildirimler, ${amount} tanesi ilgi bekliyor`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)m of talk time$/, {
      es: (amount) => `${amount} min de conversación`,
      de: (amount) => `${amount} Min. Gesprächszeit`,
      tr: (amount) => `${amount} dk konuşma süresi`,
    }, targetLocale),
    replaceMatch(source, /^([\d,.]+) conversations · ([\d,.]+) requests$/, {
      es: (conversations, requests) => `${conversations} conversaciones · ${requests} solicitudes`,
      de: (conversations, requests) => `${conversations} Unterhaltungen · ${requests} Anfragen`,
      tr: (conversations, requests) => `${conversations} konuşma · ${requests} talep`,
    }, targetLocale),
    replaceMatch(source, /^\/ ([\d,.]+) min$/, {
      es: (amount) => `/ ${amount} min`,
      de: (amount) => `/ ${amount} Min.`,
      tr: (amount) => `/ ${amount} dk`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)[–-](\d+) of (\d+)$/, {
      es: (from, to, total) => `${total} de ${from}–${to}`,
      de: (from, to, total) => `${from}–${to} von ${total}`,
      tr: (from, to, total) => `${total} kayıttan ${from}–${to}`,
    }, targetLocale),
    replaceMatch(source, /^Page (\d+) of (\d+)$/, {
      es: (page, total) => `Página ${page} de ${total}`,
      de: (page, total) => `Seite ${page} von ${total}`,
      tr: (page, total) => `${total} sayfadan ${page}. sayfa`,
    }, targetLocale),
    replaceMatch(source, /^([+−-]?\d+)% vs previous period$/, {
      es: (amount) => `${amount}% frente al periodo anterior`,
      de: (amount) => `${amount} % gegenüber dem vorherigen Zeitraum`,
      tr: (amount) => `Önceki döneme göre %${amount}`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)% of created$/, {
      es: (amount) => `${amount}% de las creadas`,
      de: (amount) => `${amount} % der erstellten`,
      tr: (amount) => `Oluşturulanların %${amount}'i`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)% of included minutes$/, {
      es: (amount) => `${amount}% de los minutos incluidos`,
      de: (amount) => `${amount} % der enthaltenen Minuten`,
      tr: (amount) => `Dahil dakikaların %${amount}'i`,
    }, targetLocale),
    replaceMatch(source, /^(\d+)% resolved$/, {
      es: (amount) => `${amount}% resueltas`,
      de: (amount) => `${amount} % gelöst`,
      tr: (amount) => `%${amount} çözüldü`,
    }, targetLocale),
    replaceMatch(source, /^(Select|Open|Call|View details for) (.+)$/, {
      es: (action, value) => `${action === "Select" ? "Seleccionar" : action === "Open" ? "Abrir" : action === "Call" ? "Llamar a" : "Ver detalles de"} ${dictionary[value] ?? value}`,
      de: (action, value) => `${action === "Select" ? "Auswählen" : action === "Open" ? "Öffnen" : action === "Call" ? "Anrufen:" : "Details anzeigen für"} ${dictionary[value] ?? value}`,
      tr: (action, value) => `${dictionary[value] ?? value} ${action === "Select" ? "kişisini seç" : action === "Open" ? "kaydını aç" : action === "Call" ? "kişisini ara" : "ayrıntılarını görüntüle"}`,
    }, targetLocale, (_action, value) => looksLikeDataValue(value, dictionary)),
    replaceMatch(source, /^(.+) isn't available yet$/, {
      es: (channel) => `${dictionary[channel] ?? channel} aún no está disponible`,
      de: (channel) => `${dictionary[channel] ?? channel} ist noch nicht verfügbar`,
      tr: (channel) => `${dictionary[channel] ?? channel} henüz kullanılamıyor`,
    }, targetLocale),
    replaceMatch(source, /^Actions for (.+)$/, {
      es: (value) => `Acciones para ${value}`,
      de: (value) => `Aktionen für ${value}`,
      tr: (value) => `${value} için işlemler`,
    }, targetLocale),
    replaceMatch(source, /^(.+) — colour picker$/, {
      es: (label) => `${dictionary[label] ?? label} — selector de color`,
      de: (label) => `${dictionary[label] ?? label} – Farbauswahl`,
      tr: (label) => `${dictionary[label] ?? label} — renk seçici`,
    }, targetLocale),
    replaceMatch(source, /^(\d+) channel needs attention — check the cards below\.$/, {
      es: (amount) => `${amount} canal requiere atención; revisa las tarjetas de abajo.`,
      de: (amount) => `${amount} Kanal erfordert Aufmerksamkeit – prüfen Sie die Karten unten.`,
      tr: (amount) => `${amount} kanal ilgi bekliyor — aşağıdaki kartları kontrol edin.`,
    }, targetLocale),
    replaceMatch(source, /^Add these records to the DNS for (.+), then check again\. If someone else manages your domain, send them this list\. DNS changes usually appear within minutes, occasionally a few hours\.$/, {
      es: (domain) => `Añade estos registros al DNS de ${domain} y vuelve a comprobar. Si otra persona gestiona tu dominio, envíale esta lista. Los cambios suelen aparecer en minutos, aunque a veces tardan unas horas.`,
      de: (domain) => `Fügen Sie diese Einträge zum DNS von ${domain} hinzu und prüfen Sie erneut. Wenn jemand anderes Ihre Domain verwaltet, senden Sie dieser Person die Liste. DNS-Änderungen erscheinen meist innerhalb weniger Minuten, gelegentlich nach einigen Stunden.`,
      tr: (domain) => `Bu kayıtları ${domain} DNS'ine ekleyip tekrar kontrol edin. Alan adınızı başka biri yönetiyorsa bu listeyi ona gönderin. DNS değişiklikleri genellikle birkaç dakika, bazen birkaç saat içinde görünür.`,
    }, targetLocale),
    replaceMatch(source, /^Used whenever it says “today”, “tomorrow” or books a time\. It is (.+) there now\. Detected from your browser\.$/, {
      es: (clock) => `Se usa cuando dice «hoy», «mañana» o reserva una hora. Allí ahora son ${localizeClockLabel(clock, "es")}. Detectado desde tu navegador.`,
      de: (clock) => `Wird verwendet, wenn „heute“, „morgen“ gesagt oder eine Uhrzeit gebucht wird. Dort ist es jetzt ${localizeClockLabel(clock, "de")}. Aus Ihrem Browser erkannt.`,
      tr: (clock) => `“Bugün”, “yarın” dediğinde veya saat ayırttığında kullanılır. Orada şu an ${localizeClockLabel(clock, "tr")}. Tarayıcınızdan algılandı.`,
    }, targetLocale),
    replaceMatch(source, /^This employee answers on chat channels — Telegram, email — and will not have a phone number\. You are using all (\d+) of your plan's numbers\.$/, {
      es: (amount) => `Este empleado responde en canales de chat —Telegram y correo— y no tendrá número de teléfono. Ya usas los ${amount} números de tu plan.`,
      de: (amount) => `Dieser Mitarbeiter antwortet in Chat-Kanälen – Telegram und E-Mail – und erhält keine Telefonnummer. Sie nutzen bereits alle ${amount} Nummern Ihres Plans.`,
      tr: (amount) => `Bu çalışan sohbet kanallarında — Telegram ve e-posta — yanıt verir ve telefon numarası olmaz. Planınızdaki ${amount} numaranın tamamını kullanıyorsunuz.`,
    }, targetLocale),
    replaceMatch(source, /^Hour of day \(UTC\) across the last (\d+) days · (\d+) channels active$/, {
      es: (days, channels) => `Hora del día (UTC) durante los últimos ${days} días · ${channels} canales activos`,
      de: (days, channels) => `Tageszeit (UTC) der letzten ${days} Tage · ${channels} Kanäle aktiv`,
      tr: (days, channels) => `Son ${days} gündeki saatler (UTC) · ${channels} etkin kanal`,
    }, targetLocale),
  ];

  return rules.find((value): value is string => Boolean(value)) ?? rawSource;
}

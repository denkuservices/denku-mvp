import { LANGUAGES, toLanguageCode, type LanguageCode } from "@/lib/language/registry";
import type { DayLabels } from "@/lib/business-hours/schema";

/**
 * Derive effective system prompt from agent configuration
 */

/**
 * Business context (R-013) the AI needs to sound like it works for this business.
 * All fields optional; only present ones are injected, so the prompt stays concise.
 */
export type BusinessContext = {
  businessName?: string | null;
  services?: string | null;
  openingHours?: string | null;
  serviceArea?: string | null;
  faqs?: string | null;
  bookingPolicy?: string | null;
  cancellationPolicy?: string | null;
  tone?: string | null;
};

type DerivePromptInput = {
  orgName: string;
  agentName: string;
  agentType: string | null;
  behaviorPreset: string | null;
  emphasisPoints: string[] | null;
  language: string | null;
  /** Languages the employee should ALSO understand, beyond `language`. (2026-08-28) */
  additionalLanguages?: readonly string[] | null;
  timezone: string | null;
  firstMessage: string | null;
  businessContext?: BusinessContext | null;
  /**
   * The workspace's STRUCTURED opening hours, already rendered ("Mon–Fri 09:00–17:00, Sat–Sun
   * closed"), plus the owner's after-hours rule.
   *
   * Passed in rather than read here because this module is pure and unit-tested. When present it
   * replaces the free-text `businessContext.openingHours` line: one of the two is a schedule the
   * product can evaluate, the other is a sentence somebody typed once, and an assistant quoting
   * both would contradict itself.
   */
  businessHoursSummary?: string | null;
  afterHoursInstruction?: string | null;
};

/**
 * The words the VOICE prompt is written in.
 *
 * Everything here is an instruction to the model, and an instruction may safely be written in
 * English — that is the R-166 rule, and it still holds. This exists because of the half of that
 * finding which the fix did not reach: on a line whose caller does not speak a word of English,
 * an English scaffold around Turkish facts is a standing invitation for GPT-4o to drift back into
 * the language it is being *instructed* in, most reliably on the improvised turns (a misheard
 * word, a failed tool call, a goodbye) — which is exactly why the prompt already had to say
 * "speak ONLY Turkish" twice and name the asymmetry. Writing the frame in the caller's language
 * removes the asymmetry instead of arguing with it.
 *
 * Scope is deliberately the VOICE prompt only. The chat prompt answers in whatever language the
 * customer writes in, so a Turkish frame there would bias it toward replying in Turkish to
 * someone writing English — a regression, not a fix. `buildBusinessContextBlock` therefore keeps
 * English labels unless a frame is passed in, and the chat prompt passes none.
 *
 * A language with no entry falls back to English, so `en` is byte-for-byte what it always was and
 * adding a language to `LANGUAGES` never silently rewrites an existing prompt.
 */
export interface PromptFrame {
  /** "You are {agent}, a voice assistant for {org}." */
  header: (agentName: string, orgName: string) => string;
  behavior: Record<string, string>;
  about: (businessName: string | null) => string;
  services: string;
  hours: string;
  serviceArea: string;
  bookingPolicy: string;
  cancellationPolicy: string;
  faqsHeader: string;
  tone: (value: string) => string;
  emphasisHeader: string;
  /**
   * What each language is CALLED in this frame.
   *
   * The registry's `label` is the English name, which is right for an English frame and wrong the
   * moment the frame is not — "Konuşma dili: Turkish" was the one English word left in an
   * otherwise Turkish prompt, sitting in the very line that tells the model which language to
   * speak. Anything missing falls back to the registry label.
   */
  languageNames?: Partial<Record<LanguageCode, string>>;
  /** The single-language line: "Primary language: X. Respond naturally in this language." */
  primaryLanguage: (name: string) => string;
  /** The multilingual line, when the employee also understands others. */
  multiLanguage: (primary: string, all: string[]) => string;
  /**
   * The reinforcement for a non-English employee.
   *
   * Null where the frame is already written in that language — the paragraph exists to explain
   * why the surrounding text is in a language the caller does not speak, and once it is not, the
   * explanation is a lie and the repetition is noise.
   */
  englishAsymmetry: ((name: string) => string) | null;
  timezone: (tz: string) => string;
  closing: string;
  brevity: string;
  critical: (spokenFallback: string) => string;
  /**
   * The structured opening hours, in this frame's words.
   *
   * `dayLabels` is handed to `describeBusinessHours`; the three sentences are the standing
   * honesty rule and the two after-hours behaviours. They live here rather than in
   * `business-hours/schema.ts` because that module also renders the English Settings card and the
   * audit log, and only the voice prompt needs translating.
   */
  businessHours: {
    dayLabels: DayLabels;
    summary: (description: string, timeZone: string) => string;
    /** Always true, whatever the hour — the hours never gate the AI. */
    alwaysOn: string;
    noteHours: string;
    answerNormally: string;
  };
}

const EN_FRAME: PromptFrame = {
  header: (agentName, orgName) => `You are ${agentName}, a voice assistant for ${orgName}.`,
  behavior: {
    professional:
      "You are a professional and courteous assistant. Maintain a polite, concise, and consistent tone. Focus on clarity and efficiency while being respectful.",
    support:
      "You are a calm and empathetic support specialist. Be patient, understanding, and provide clear troubleshooting steps. Help users feel heard and supported.",
    concierge:
      "You are a warm and welcoming concierge. Be friendly, personable, and helpful. Great for booking, customer care, and making people feel valued.",
    sales:
      "You are a confident sales closer. Lead with value, handle objections proactively, and use conversion-focused language. Be persuasive but not pushy.",
    direct:
      "You are direct and efficient. Minimize small talk, focus on speed and accuracy. Get to the point quickly while remaining professional.",
    custom: "You are a helpful assistant. Follow the custom instructions provided.",
  },
  about: (businessName) => (businessName ? `About ${businessName}:` : "About the business:"),
  services: "Services",
  hours: "Hours",
  serviceArea: "Service area",
  bookingPolicy: "Booking policy",
  cancellationPolicy: "Cancellation policy",
  faqsHeader: "Common caller questions (answer from these):",
  tone: (value) => `Tone: ${value}.`,
  emphasisHeader: "Key points to emphasize:",
  primaryLanguage: (name) => `Primary language: ${name}. Respond naturally in this language.`,
  multiLanguage: (primary, all) =>
    `You speak ${all.join(" and ")}. Start the call in ${primary}. If the caller speaks one of ` +
    `the others, switch to it and stay in it for the rest of the call. Never tell a caller you ` +
    `cannot speak their language when it is one of these.`,
  englishAsymmetry: (name) =>
    `These instructions are written in English for internal reasons. The caller does not speak ` +
    `English. Speak ONLY ${name}, in every single turn — including when you are confused, when ` +
    `something fails, and when you say goodbye. Never switch to English, and never apologise for ` +
    `your ${name}.`,
  timezone: (tz) => `Timezone: ${tz}. When discussing times or dates, use this timezone context.`,
  closing:
    "Be helpful, accurate, and maintain the appropriate tone for your role. If you don't know something, say so honestly.",
  brevity: [
    "SPEAK LIKE A PERSON ON A PHONE, NOT A BROCHURE:",
    "- Keep answers to one or two sentences. The caller cannot skim; they can only wait.",
    "- Never recite a list of options, prices, or features unprompted. If the caller asks about " +
      "something with several parts, give the shortest useful answer first, then ask whether they " +
      'want the detail (e.g. "Want me to run through the options?").',
    "- Answer the question that was asked. Do not add information they did not ask for.",
    "- Do not repeat back what you just did more than once.",
  ].join("\n"),
  critical: (spokenFallback) =>
    `CRITICAL: If you are uncertain, if the intent is unclear, or if any tool call fails, you ` +
    `must say exactly: "${spokenFallback}" Do not apologize or provide extra explanation.`,
  businessHours: {
    dayLabels: { short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], closed: "closed" },
    summary: (description, timeZone) => `${description} (${timeZone})`,
    alwaysOn:
      "You answer this line 24 hours a day. The hours above are when STAFF are in, not when you " +
      "work — never refuse a caller, end a call early, or decline to take a booking because of them.",
    noteHours:
      "If a caller reaches you outside those hours, say briefly that the business is closed right " +
      "now, then carry on and help them fully. Be honest that a person will follow up once it " +
      "reopens, and never promise a specific callback time or that someone is available now.",
    answerNormally: "Do not raise the opening hours unless the caller asks.",
  },
};

const TR_FRAME: PromptFrame = {
  header: (agentName, orgName) => `Sen ${agentName}'sın, ${orgName} için çalışan bir sesli asistansın.`,
  behavior: {
    professional:
      "Profesyonel ve nazik bir asistansın. Kibar, kısa ve tutarlı bir üslup kullan. Net ve verimli ol, saygıyı elden bırakma.",
    support:
      "Sakin ve anlayışlı bir destek uzmanısın. Sabırlı ol, arayanı anladığını hissettir ve atılacak adımları net biçimde söyle.",
    concierge:
      "Sıcak ve karşılayıcı bir danışmansın. Samimi, kibar ve yardımseversin; arayan kendini değerli hissetsin.",
    sales:
      "Kendine güvenen bir satış temsilcisisin. Önce faydayı anlat, itirazları karşıla, yönlendirici bir dil kullan; ama asla baskı yapma.",
    direct:
      "Doğrudan ve verimlisin. Gereksiz sohbeti en aza indir, hız ve doğruluğa odaklan; bunu yaparken profesyonelliği koru.",
    custom: "Yardımcı bir asistansın. Sana verilen özel talimatları uygula.",
  },
  about: (businessName) => (businessName ? `${businessName} hakkında:` : "İşletme hakkında:"),
  services: "Hizmetler",
  hours: "Çalışma saatleri",
  serviceArea: "Hizmet bölgesi",
  bookingPolicy: "Sipariş ve randevu politikası",
  cancellationPolicy: "İptal ve iade politikası",
  faqsHeader: "Sık sorulan sorular (cevapları buradan ver):",
  tone: (value) => `Üslup: ${value}.`,
  emphasisHeader: "Özellikle dikkat edilecek noktalar:",
  languageNames: { en: "İngilizce", es: "İspanyolca", de: "Almanca", tr: "Türkçe" },
  primaryLanguage: (name) => `Konuşma dili: ${name}. Bu dilde doğal biçimde konuş.`,
  multiLanguage: (primary, all) =>
    `${all.join(" ve ")} konuşuyorsun. Görüşmeye ${primary} başla. Arayan diğerlerinden birini ` +
    `konuşuyorsa o dile geç ve görüşmenin sonuna kadar o dilde kal. Bu dillerden birini konuşan ` +
    `birine asla o dili bilmediğini söyleme.`,
  // The frame is already Turkish; there is no asymmetry left to explain.
  englishAsymmetry: null,
  timezone: (tz) => `Saat dilimi: ${tz}. Saat ve tarihlerden bahsederken bu saat dilimini kullan.`,
  closing:
    "Yardımsever ve doğru ol, rolüne uygun üslubu koru. Bilmediğin bir şey olursa dürüstçe bilmediğini söyle.",
  brevity: [
    "TELEFONDAKİ BİR İNSAN GİBİ KONUŞ, KATALOG GİBİ DEĞİL:",
    "- Cevapların bir ya da iki cümle olsun. Arayan yazıyı gözüyle tarayamaz, sadece bekler.",
    "- Sorulmadan seçenek, fiyat veya özellik listesi sıralama. Birden çok parçası olan bir soru " +
      "gelirse önce en kısa faydalı cevabı ver, sonra detay isteyip istemediğini sor (örneğin: " +
      '"Seçenekleri tek tek anlatmamı ister misiniz?").',
    "- Sorulan soruyu cevapla. İstenmeyen bilgiyi ekleme.",
    "- Az önce yaptığın şeyi bir kereden fazla tekrarlama.",
  ].join("\n"),
  critical: (spokenFallback) =>
    `ÇOK ÖNEMLİ: Emin değilsen, ne istendiği net değilse veya bir araç çağrısı başarısız olursa ` +
    `aynen şunu söyle: "${spokenFallback}" Özür dileme, fazladan açıklama yapma.`,
  businessHours: {
    dayLabels: { short: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"], closed: "kapalı" },
    summary: (description, timeZone) => `${description} (${timeZone})`,
    alwaysOn:
      "Bu hatta 7/24 sen cevap veriyorsun. Yukarıdaki saatler EKİBİN işte olduğu saatlerdir, senin " +
      "çalışma saatin değil — bu saatler yüzünden asla arayanı geri çevirme, görüşmeyi erken " +
      "bitirme veya kayıt açmayı reddetme.",
    noteHours:
      "Arayan bu saatlerin dışında ulaştıysa işletmenin şu an kapalı olduğunu kısaca söyle, sonra " +
      "sonuna kadar yardımcı olmaya devam et. Ekipten birinin işletme açıldığında döneceğini " +
      "dürüstçe belirt; asla belirli bir geri dönüş saati verme ve şu anda birinin müsait olduğunu " +
      "ima etme.",
    answerNormally: "Arayan sormadıkça çalışma saatlerinden söz etme.",
  },
};

const FRAMES: Partial<Record<LanguageCode, PromptFrame>> = {
  en: EN_FRAME,
  tr: TR_FRAME,
};

/** The frame for a language. Anything without one keeps the English prompt it has always had. */
function frameFor(code: LanguageCode | null): PromptFrame {
  return (code && FRAMES[code]) || EN_FRAME;
}

/**
 * The frame for a stored language string ("tr", "Turkish", null…).
 *
 * Exported for the one caller outside this module that renders text into the SAME prompt:
 * `hoursForPrompt` in the agents action, which turns structured opening hours into the two lines
 * `deriveEffectivePrompt` is handed. Rendering those in English while everything around them is
 * Turkish is the exact failure this file exists to stop.
 */
export function promptFrameFor(language?: string | null): PromptFrame {
  return frameFor(toLanguageCode(language));
}

/**
 * Build the concise "About the business" block — only non-empty fields (R-013).
 *
 * `frame` is optional and defaults to English so the chat prompt, which shares this function, is
 * untouched. Only the voice prompt passes one.
 */
export function buildBusinessContextBlock(ctx?: BusinessContext | null, frame: PromptFrame = EN_FRAME): string {
  if (!ctx) return "";
  const clean = (v?: string | null) => (typeof v === "string" ? v.trim() : "");
  const lines: string[] = [];
  const name = clean(ctx.businessName);
  if (clean(ctx.services)) lines.push(`- ${frame.services}: ${clean(ctx.services)}`);
  if (clean(ctx.openingHours)) lines.push(`- ${frame.hours}: ${clean(ctx.openingHours)}`);
  if (clean(ctx.serviceArea)) lines.push(`- ${frame.serviceArea}: ${clean(ctx.serviceArea)}`);
  if (clean(ctx.bookingPolicy)) lines.push(`- ${frame.bookingPolicy}: ${clean(ctx.bookingPolicy)}`);
  if (clean(ctx.cancellationPolicy)) lines.push(`- ${frame.cancellationPolicy}: ${clean(ctx.cancellationPolicy)}`);

  let block = "";
  if (name || lines.length > 0) {
    block += `${frame.about(name || null)}\n`;
    if (lines.length > 0) block += lines.join("\n") + "\n";
    block += "\n";
  }
  if (clean(ctx.faqs)) {
    block += `${frame.faqsHeader}\n${clean(ctx.faqs)}\n\n`;
  }
  if (clean(ctx.tone)) {
    block += `${frame.tone(clean(ctx.tone))}\n\n`;
  }
  return block;
}

/**
 * The one sentence the prompt orders the AI to say VERBATIM — in each language it can speak.
 *
 * Everything else in this prompt is an instruction TO the model, and an instruction may safely be
 * written in English: the model reads English and answers in the language it was told to. This
 * line is the exception, because it is not an instruction — it is speech, quoted, under "say
 * exactly". A Turkish caller therefore heard *"I'll notify our team and make sure someone follows
 * up shortly"* at the single moment the call had already gone wrong: an unclear intent or a failed
 * tool call. The never-dead-end promise was kept and the caller could not understand it.
 *
 * Found 2026-09-03 on the first Turkish workspace (NOTUS, medical uniforms, Aydın).
 *
 * A language with no entry falls back to English, which is exactly the behaviour before this
 * existed — so adding a language to `LANGUAGES` never silently changes an existing prompt, and
 * `en` is byte-for-byte what it always was.
 */
const SPOKEN_FALLBACK: Partial<Record<LanguageCode, string>> = {
  en: "I'll notify our team and make sure someone follows up shortly.",
  tr: "Ekibimize ileteceğim, en kısa sürede size dönüş yapılacak.",
  es: "Avisaré a nuestro equipo para que alguien le contacte en breve.",
  de: "Ich gebe das an unser Team weiter, jemand meldet sich in Kürze bei Ihnen.",
};

export function deriveEffectivePrompt(input: DerivePromptInput): string {
  const {
    orgName,
    agentName,
    behaviorPreset,
    emphasisPoints,
    language,
    additionalLanguages,
    timezone,
    businessContext,
  } = input;

  // Structured hours win over the free-text line, so the AI never quotes two different schedules.
  const effectiveContext: BusinessContext | null = input.businessHoursSummary
    ? { ...(businessContext ?? {}), openingHours: input.businessHoursSummary }
    : businessContext ?? null;

  /*
   * The language this prompt is WRITTEN in — resolved before anything is written.
   *
   * The same code that decides which language the employee SPEAKS, because a prompt framed in one
   * language and ordering another is precisely the asymmetry that made the old English frame need
   * two paragraphs of argument to hold.
   */
  const primaryCode = toLanguageCode(language);
  const frame = frameFor(primaryCode);

  // Base prompt
  let prompt = `${frame.header(agentName, orgName)}\n\n`;

  // Add behavior preset prompt
  {
    // behaviorPreset is stored as ID (e.g., "professional", "support")
    const presetKey = (behaviorPreset ?? "").toLowerCase();
    prompt += `${frame.behavior[presetKey] || frame.behavior.professional}\n\n`;
  }

  // Business context (R-013) — inject early so the AI answers as this specific business.
  prompt += buildBusinessContextBlock(effectiveContext, frame);

  /*
   * How to talk about those hours.
   *
   * A standing rule rather than a fact about this call, because a Vapi assistant's prompt is
   * written once and reused — it cannot be told "it is 11pm now". That costs nothing here: the
   * hours never decide WHETHER the assistant helps, only what it is honest about. The line is
   * always answered.
   */
  if (input.businessHoursSummary && input.afterHoursInstruction) {
    prompt += `${input.afterHoursInstruction}

`;
  }

  // Add emphasis points
  if (emphasisPoints && emphasisPoints.length > 0) {
    prompt += `${frame.emphasisHeader}\n`;
    emphasisPoints.forEach((point, idx) => {
      prompt += `${idx + 1}. ${point}\n`;
    });
    prompt += "\n";
  }

  /*
   * Language (2026-08-28).
   *
   * Vapi's own guidance is explicit that this cannot be left implicit: an assistant does not work
   * out that it is allowed to speak more than one language unless the prompt names them. The
   * transcriber can be listening for Spanish and the model will still answer in English.
   *
   * The first language is where the call starts — someone has to say hello in one language — and
   * the rest are followed if the caller uses them.
   */
  /*
   * Say the language's NAME, not whichever spelling happens to be stored.
   *
   * Onboarding writes the ISO code ("en") and the Setup editor writes the label ("English") — the
   * same R-135 split that once produced an English-speaking "Spanish" employee. Left alone, a
   * prompt would read "You speak en and Spanish", which is both ugly and a worse instruction.
   */
  const languageName = (raw: string) => {
    const code = toLanguageCode(raw);
    if (!code) return raw.trim();
    // The frame's own name for it, so a Turkish prompt does not order the AI to speak "Turkish".
    return frame.languageNames?.[code] ?? LANGUAGES[code].label;
  };

  const primaryName = language ? languageName(language) : null;
  const extraLanguages = Array.from(
    new Set(
      (additionalLanguages ?? [])
        .filter((l) => l && l.trim())
        .map(languageName)
        .filter((l) => l !== primaryName)
    )
  );

  if (primaryName && extraLanguages.length > 0) {
    prompt += `${frame.multiLanguage(primaryName, [primaryName, ...extraLanguages])}\n\n`;
  } else if (primaryName) {
    prompt += `${frame.primaryLanguage(primaryName)}\n\n`;
    /*
     * Say it twice, and say why — but ONLY while the instructions and the caller disagree.
     *
     * Where the frame is English and the caller is not, GPT-4o drifts back into the language it is
     * being INSTRUCTED in, most reliably on the turns that matter: a misheard word, a failed tool
     * call, a goodbye. The rule is therefore restated as a prohibition and the asymmetry is named,
     * so the model cannot read the English around it as permission.
     *
     * A frame written in the caller's own language has no such asymmetry to name, and its entry
     * is null — repeating the prohibition there would explain a problem that is not present and
     * cite an English text the model can see is not English.
     */
    if (primaryCode && primaryCode !== "en" && frame.englishAsymmetry) {
      prompt += `${frame.englishAsymmetry(primaryName)}\n\n`;
    }
  }

  // Add timezone context
  if (timezone) {
    prompt += `${frame.timezone(timezone)}\n\n`;
  }

  // Closing instruction
  prompt += `${frame.closing}\n\n`;

  /*
   * Brevity (2026-08-27) — added after listening to a real call.
   *
   * Asked "what are your plans?", the AI recited three plans with prices and minute
   * allowances in one unbroken turn, then did it again on the next call. On a phone line that is
   * unusable: the caller cannot skim, cannot go back, and has stopped listening by the second
   * price. Nothing in the prompt asked for brevity, so the model defaulted to completeness — the
   * right instinct in a chat window and the wrong one out loud.
   *
   * This is a prompt problem, not a latency setting. Speech pace lives in the voice config.
   *
   * Note the parenthetical example inside the block: it is a sentence the AI is shown as something
   * to SAY, so it travels with the frame rather than staying English. That is R-166 applied to the
   * one place it was still true after the fallback line was fixed.
   */
  prompt += `${frame.brevity}\n\n`;

  // Mandatory fallback rule: Never leave caller without a clear next step — in a language the
  // caller actually speaks (see SPOKEN_FALLBACK).
  const fallbackLine = SPOKEN_FALLBACK[primaryCode ?? "en"] ?? SPOKEN_FALLBACK.en;
  prompt += frame.critical(fallbackLine as string);

  return prompt.trim();
}


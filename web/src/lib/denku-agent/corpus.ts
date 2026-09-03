import "server-only";

import {
  addonSentence,
  channelSentence,
  languageSentence,
  planSentence,
  type AddonFact,
  type PlanFact,
} from "@/lib/denku-agent/facts";

/**
 * What Denku's own assistant is allowed to know about Denku.
 *
 * **This corpus is customer-facing. `skills/*.md` must never be fed to this assistant.**
 * Those files are engineering memory: they carry security landmines, unfixed bugs, and honest
 * `productionReady: false` admissions written for a developer. A prospect asking "is it secure?"
 * getting landmine #1 read back to them is the failure this sentence exists to prevent. Anything
 * true and sellable from those documents is RESTATED here, in the words a customer should hear,
 * and reviewed as such.
 *
 * Two kinds of chunk:
 *
 *   - **Authored** — prose written once, reviewed by a human, and translated by the model at
 *     speaking time. English-only on purpose: a technical claim ("your carrier must give us an
 *     IPv4 address") mistranslated into a wrong promise is worse than an accent.
 *   - **Computed** — rendered from `facts.ts` at call time, so availability and prices can never
 *     be stale. These are the ones a hand-written prompt always gets wrong first.
 *
 * The retrieval contract: the model picks a chunk by `id` from the tool enum, so there is no
 * embedding index to build, nothing to re-index on deploy, and every possible answer is
 * enumerable in a test. `tags` back the keyword fallback for when the model passes a question
 * instead of an id.
 */

export type CorpusContext = {
  plans: PlanFact[];
  addons: AddonFact[];
};

export type CorpusChunk = {
  id: string;
  /** Shown to the model in the tool enum description — this is how it decides. */
  title: string;
  tags: readonly string[];
  body: string | ((ctx: CorpusContext) => string);
};

export const CORPUS: readonly CorpusChunk[] = [
  // ─── What Denku is ────────────────────────────────────────────────────────────────────
  {
    id: "what-denku-is",
    title: "What Denku is and who it is for",
    tags: ["what", "about", "overview", "product", "who"],
    body:
      "Denku sells AI employees for small and medium businesses. A business hires an AI employee " +
      "and connects channels to it. The AI answers customers around the clock, every day of the " +
      "week, in the " +
      "business's own voice — answering questions about the business, taking messages, and booking " +
      "appointments. Every finished conversation produces something the owner can act on: a ticket " +
      "or an appointment request, plus a contact record. Nothing is left as just a transcript.",
  },
  {
    id: "services-overview",
    title: "The four things Denku sells (AI Employees, AI Audit, AI Studio, Custom AI)",
    tags: ["services", "offerings", "audit", "studio", "custom", "what do you sell"],
    body:
      "Denku sells four things. (1) AI Employees — the self-serve product, priced publicly, where " +
      "a business gets an AI that answers its calls and messages. (2) AI Audit — a paid engagement " +
      "where we look at how a business currently handles its customer contact and report where an " +
      "AI would and would NOT help. (3) AI Studio — production work: we build the AI experience for " +
      "the business rather than handing them a self-serve product; prices are published as a " +
      "starting point but the real number comes out of a conversation, because a studio package " +
      "buys production time that cannot be scoped before we talk. (4) Custom AI — bespoke work with " +
      "no printed price. Only AI Employees can be bought online; the other three start with an " +
      "enquiry.",
  },

  // ─── Computed: never allowed to go stale ──────────────────────────────────────────────
  {
    id: "pricing-voice",
    title: "Voice plan prices, included minutes, overage and concurrency",
    tags: ["price", "pricing", "cost", "plan", "how much", "minutes", "overage"],
    body: (ctx) =>
      `${planSentence(ctx.plans)}\n\n${addonSentence(ctx.addons)}\n\n` +
      "Every voice plan includes one phone number. There is no free trial and no setup fee. " +
      "Plans are monthly and can be cancelled at any time. Minutes are counted per call and each " +
      "call is rounded up to the next whole minute.",
  },
  {
    id: "pricing-chat",
    title: "Chat pricing — sold by channel, not by message",
    tags: ["chat price", "chat plan", "per message", "channels price"],
    body: (ctx) => {
      const chat = ctx.addons.filter((a) => a.key.startsWith("chat_"));
      const lines = chat.map((a) => `- ${a.label}: $${a.monthlyUsd}/month.`).join("\n");
      return (
        "Chat is priced by how many channels the AI answers on, not by how many messages it " +
        "handles. There is no message counter to run out of.\n" +
        `${lines}\n\n` +
        // Naming them is the point. On the first real call the assistant explained chat pricing
        // without ever saying WHICH channels, so a shop owner who wanted Telegram could not tell
        // that Denku does Telegram.
        `Which channels those can be:\n${channelSentence()}\n` +
        "More channels, CRM and API integrations, or a model trained on the business's own " +
        "material is a custom quote.\n\n" +
        "Voice and chat are two independent products. A business can buy either, both, or neither " +
        "— buying chat does not require a voice plan and does not give them a phone number. Chat " +
        "is not self-serve yet: the customer tells us which channels they want and we set it up."
      );
    },
  },
  {
    id: "channels-available",
    title: "Which channels the AI answers on today (and which it does not)",
    tags: ["channel", "whatsapp", "instagram", "telegram", "email", "sms", "messenger", "web chat"],
    body: () =>
      `${channelSentence()}\n\n` +
      "Be exact about this difference when asked. A channel the AI does not answer on yet can " +
      "still be connected — the messages arrive in the same Inbox and a person can reply — but the " +
      "AI does not write there. Never describe a channel that is not built as though it were " +
      "available soon with a date; there is no committed date.",
  },
  {
    id: "languages",
    title: "Which languages Denku speaks",
    tags: ["language", "languages", "speak", "english", "spanish", "german", "turkish"],
    body: () =>
      `${languageSentence()}\n\n` +
      "An AI employee can be set to one language, or to understand several and answer in whichever " +
      "the customer used. The voice follows the customer's language rather than reading their " +
      "language with an English mouth.",
  },

  // ─── Telephony / BYON ─────────────────────────────────────────────────────────────────
  {
    id: "phone-number-provided",
    title: "The phone number Denku provides",
    tags: ["number", "phone number", "provisioning", "us number", "area code"],
    body:
      "Every voice plan includes one phone number, and Denku provisions United States numbers. " +
      "The number is claimed during setup and answers as soon as activation finishes. Extra " +
      "numbers are an add-on. A business that wants a number in another country should bring " +
      "their own — see the question about connecting an existing number.",
  },
  {
    id: "bring-your-own-number",
    title: "Connecting a number the business already owns (BYON / SIP trunk)",
    tags: ["own number", "byon", "sip", "trunk", "existing number", "port", "carrier", "transfer"],
    body:
      "Yes — a business can keep its existing number and have the AI answer it, without porting " +
      "the number away from their carrier. It works by SIP trunk: the carrier forwards calls for " +
      "that number to us, and the AI answers.\n\n" +
      "What the business needs:\n" +
      "- A carrier account that supports SIP trunking, with SIP credentials (a username and " +
      "password) they can create in their carrier panel.\n" +
      "- Their carrier's SIP gateway as a numeric IPv4 address. A hostname alone is not enough — " +
      "the connection is refused without the address itself.\n" +
      "- The ability to set the forwarding destination in their carrier panel to sip.vapi.ai, and " +
      "to set the caller and called number prefixes so numbers arrive in full international " +
      "format.\n\n" +
      "This is proven: a Turkish Netgsm line was connected and answered by the AI on 1 September " +
      "2026, and Netgsm has a ready-made preset. Any other carrier is supported in principle but " +
      "has not been done before, so it is set up together with us rather than self-serve. Be " +
      "honest about that — say Netgsm is proven and another carrier is a setup we would do with " +
      "them.\n\n" +
      "One caveat worth stating: the AI answers in the language the employee is configured for, so " +
      "a non-English number needs a matching voice, which is part of the setup.",
  },
  {
    id: "always-answers",
    title: "Opening hours — the AI answers at every hour",
    tags: ["hours", "24/7", "after hours", "night", "weekend", "closed", "open"],
    body:
      "Denku answers around the clock, every day of the week, on every channel. (Say that with the " +
      "idiom the visitor's own language uses — Turkish says 7/24, not 24/7.) Opening hours in " +
      "Denku " +
      "describe when the business's STAFF are in — they never stop the AI from answering. A " +
      "business paying for an AI employee is buying the eleven-at-night call its competitors miss. " +
      "If hours are configured, the owner chooses whether the AI mentions that the business is " +
      "currently closed before carrying on and helping fully, or simply does not raise it. Either " +
      "way the customer is helped, and told honestly that a person follows up later.",
  },

  // ─── How it works day to day ──────────────────────────────────────────────────────────
  {
    id: "what-happens-after-a-call",
    title: "What the owner gets after a call or conversation",
    tags: ["ticket", "appointment", "transcript", "lead", "inbox", "what happens", "notification"],
    body:
      "Every finished conversation is turned into something actionable: a ticket (a task for the " +
      "business) or an appointment request, plus a contact record. This is guaranteed — if the AI " +
      "never got round to creating one during the conversation, the system creates it afterwards " +
      "from the transcript, so a conversation is never lost. The owner sees calls, conversations, " +
      "tickets, appointments and contacts in one dashboard, with the recording and transcript " +
      "attached, and is emailed when something new needs them.",
  },
  {
    id: "human-takeover",
    title: "Can a person take over from the AI?",
    tags: ["human", "takeover", "handover", "agent", "person", "live chat", "escalate"],
    body:
      "Yes, on chat channels. Every conversation lives in one Inbox and a person can take it over " +
      "and reply themselves; the AI stops answering that conversation. On a phone call the AI " +
      "cannot transfer the caller to a person mid-call today — instead it takes the message and " +
      "creates a ticket so someone calls back. Say that plainly rather than implying a warm " +
      "transfer exists.",
  },
  {
    id: "media-understanding",
    title: "Can the AI see photos and hear voice notes?",
    tags: ["photo", "image", "picture", "voice note", "audio", "attachment", "see", "hear"],
    body:
      "Yes, on chat channels. A customer can send a photo and the AI reads what is in it, or send " +
      "a voice note and the AI hears it and answers as if it had been typed. This works the same " +
      "way on every chat channel that can carry a file. If a file cannot be read, the AI says so " +
      "rather than guessing at its contents.",
  },
  {
    id: "training-the-ai",
    title: "How a business teaches the AI about itself",
    tags: ["train", "training", "knowledge", "documents", "upload", "faq", "learn", "customise"],
    body:
      "The business fills in a short Knowledge section — what it does, its hours, its service " +
      "area, its booking and cancellation policies, common questions, and the tone it wants — and " +
      "can upload documents such as a price list or a service menu, which are read and turned into " +
      "text the AI uses. Denku can draft those fields from what the owner already told us during " +
      "signup, but the draft is always shown for the owner to correct before it is saved, because " +
      "anything in there is spoken to their customers as though the business had said it.",
  },
  {
    id: "setup-time",
    title: "How long setup takes and what it involves",
    tags: ["setup", "how long", "onboarding", "install", "start", "live", "quick"],
    body:
      "Signing up is a short guided setup: the business says what it wants the AI to do, picks a " +
      "language, chooses whether it needs a phone number, picks a plan, and the AI is activated. " +
      "The number is live the same day. Teaching the AI about the business is done afterwards in " +
      "the dashboard and can be improved at any time. If asked for an exact number of minutes, " +
      "give a range rather than a promise, and offer to walk them through it.",
  },
  {
    id: "email-sending-limit",
    title: "How the Email channel works, and the one thing it needs from the customer",
    tags: ["email", "mail", "forward", "inbox", "dns", "domain", "send", "reply by email"],
    body:
      "Email works by forwarding, not by handing Denku the customer's mailbox password. The " +
      "business forwards a published address such as info@ to an address Denku issues them, and " +
      "from that moment new mail arrives in the same Inbox as everything else. The AI reads it, " +
      "understands the thread, and writes the reply. By default a person approves the reply " +
      "before it goes out; that can be changed.\n\n" +
      "Two things to be honest about, both of which surprise people:\n" +
      "- Forwarding brings NOTHING from the past. Only mail arriving after the rule is switched " +
      "on appears. Never say their existing unread mail will show up.\n" +
      "- To send as their OWN domain, the business must publish DNS records for it. Until they " +
      "do, Denku will not send on their behalf — there is no fallback to a Denku address, " +
      "because a customer receiving a reply from a stranger's domain is worse than no reply. " +
      "Receiving, reading and drafting all work the day they forward; automatic sending waits on " +
      "their DNS. If they ask how long that takes, it is usually minutes of work for whoever " +
      "manages their domain, plus propagation.",
  },
  {
    id: "web-chat-widget",
    title: "Putting the AI on the business's own website",
    tags: ["website", "widget", "embed", "web chat", "site", "snippet", "script"],
    body:
      "There is a chat widget the business pastes into their own website as a short snippet, and " +
      "it appears as a launcher in the corner of their pages. Access is controlled by the list of " +
      "domains the business says it will be used on, so the widget only runs on their own site — " +
      "which means they must tell us their domain when they install it. Human takeover works " +
      "there like every other chat channel, and the AI can see photos a visitor uploads.\n\n" +
      "Web chat counts as one of the channels on a chat plan, the same as Telegram or email. If " +
      "a business has no chat plan the widget still appears and the conversation is visible in " +
      "their Inbox for a person to answer, but the AI does not reply — so a visitor never meets a " +
      "broken widget.",
  },
  {
    id: "ecommerce-integration",
    title: "Connecting an online store so the AI knows the catalogue",
    tags: ["ecommerce", "store", "shop", "ideasoft", "catalogue", "stock", "product", "order"],
    body:
      "Denku can connect to a business's e-commerce backend so the AI can answer questions about " +
      "products — what exists, what it costs, and what is in stock, including per-variant stock so " +
      "it does not say 'we have it' when only one size is left. IdeaSoft is the first supported " +
      "system. This is an integration, not a channel: the customer still talks on Telegram or the " +
      "website, and the product facts come from the store.\n\n" +
      "Be honest about maturity: this is built but has never been run against a real store, so " +
      "offer it as something we would set up together and verify, not as a proven feature. Order " +
      "lookup — 'where is my order' — is deliberately NOT available yet, because an anonymous " +
      "visitor must never be able to read a stranger's order details.",
  },

  // ─── Commercial ───────────────────────────────────────────────────────────────────────
  {
    id: "trial-and-cancellation",
    title: "Free trial, contracts and cancellation",
    tags: ["trial", "free", "contract", "cancel", "commitment", "refund", "money back"],
    body:
      "There is no free trial. Plans are monthly and can be cancelled at any time — there is no " +
      "annual commitment. If someone wants to try before buying, the honest offer is a demo " +
      "conversation like this one, or an AI Audit. Do not invent a refund policy; if asked about " +
      "refunds, say a person will confirm the details.",
  },
  {
    id: "who-is-it-for",
    title: "What kind of business Denku suits — and when it does not",
    tags: ["fit", "suitable", "industry", "small business", "right for me", "use case"],
    body:
      "Denku suits businesses that lose customers to unanswered calls and messages: clinics, " +
      "salons, garages, trades, local services, small e-commerce. It is a good fit when the " +
      "questions customers ask are mostly answerable from what the business already knows, and " +
      "when the outcome wanted is a booking, a message taken, or a question answered.\n\n" +
      "Be willing to say when it is NOT a fit — a business whose calls are all complex negotiation, " +
      "or one that needs the AI to complete a regulated transaction, is better served by talking to " +
      "us about AI Studio than by buying the self-serve product. Saying so earns more trust than a " +
      "sale that gets refunded.",
  },
  {
    id: "security-and-data",
    title: "Security and what happens to customer data",
    tags: ["security", "data", "gdpr", "privacy", "compliance", "encrypted", "safe", "kvkk"],
    body:
      "Each business's data is isolated per workspace and enforced at the database level, not just " +
      "in the application. Credentials a business connects — a Telegram bot token, an Instagram " +
      "token, store API credentials — are encrypted at rest and never shared between businesses. " +
      "Calls are recorded and transcripts stored so the owner can review them. Access inside a " +
      "workspace is controlled by role, and the actions that spend money or change membership are " +
      "recorded in an audit log the owner can export.\n\n" +
      "Do NOT claim SOC 2, HIPAA, ISO or any other certification. Denku holds none, and claiming " +
      "one is a legal problem rather than a sales flourish. If asked, say plainly that Denku is not " +
      "certified today, and offer to have someone walk them through how their data is actually " +
      "handled.",
  },
  {
    id: "how-it-compares",
    title: "How Denku differs from voicemail, an IVR or an answering service",
    tags: ["compare", "competitor", "ivr", "voicemail", "answering service", "difference", "why"],
    body:
      "A voicemail takes a message the business still has to listen to. An IVR makes the customer " +
      "navigate a menu to reach a person who may not be there. An answering service costs per call " +
      "and does not know the business. Denku answers in the business's own words, knows its " +
      "services, hours and policies, books appointments directly, and hands the owner a finished " +
      "ticket rather than a recording to process. Compare on what happens AFTER the call — that is " +
      "where the difference is.",
  },
  {
    id: "getting-started",
    title: "What to do next / how to buy",
    tags: ["buy", "sign up", "start", "next step", "demo", "contact", "talk to someone"],
    body:
      "AI Employees can be bought online: the visitor signs up, picks a plan and is guided through " +
      "activation. AI Audit, AI Studio and Custom AI start with an enquiry form on the site. If " +
      "the caller wants a person, take their name and how to reach them and create the follow-up — " +
      "do not just tell them to visit a page. Booking a call with the team is always a good next " +
      "step for anything you could not answer.",
  },
];

/** Every chunk id — the enum the model chooses from. */
export const CORPUS_IDS: readonly string[] = CORPUS.map((c) => c.id);

export function renderChunk(chunk: CorpusChunk, ctx: CorpusContext): string {
  return typeof chunk.body === "function" ? chunk.body(ctx) : chunk.body;
}

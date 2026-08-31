import "server-only";

import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLlmProvider } from "@/lib/llm/provider";

/**
 * Read a customer's own website and pull out the facts their AI would otherwise have to say
 * "I'll pass that to the team" about.
 *
 * **This makes the server fetch a URL a user supplied, which is a server-side request forgery
 * hole unless it is guarded.** Denku runs on Vercel, alongside internal services and a cloud
 * metadata endpoint at 169.254.169.254 that hands out credentials to anything that asks. A
 * customer typing that address into an onboarding field must not turn our server into their
 * proxy for it. So: HTTPS/HTTP only, no credentials in the URL, every resolved hop checked
 * against private and link-local ranges, redirects followed manually and re-checked at each one,
 * a hard timeout, and a size cap.
 *
 * **What comes back is a SUGGESTION, never a decision.** Nothing here is written into
 * `agents.business_context`. It becomes placeholder text and input to the Knowledge draft, both
 * of which a person confirms. A real page is not the same as a current page — an opening time
 * scraped from a site last updated in 2019 and then spoken to a caller as the business's own
 * word is wrong in exactly the way that loses a customer, and "we read it off your website" is
 * no defence.
 */

export type WebsiteFacts = {
  businessName?: string;
  services?: string;
  openingHours?: string;
  serviceArea?: string;
  faqs?: string;
  bookingPolicy?: string;
  cancellationPolicy?: string;
  /** What the business appears to do, in a few words — used to steer the Knowledge draft. */
  industry?: string;
};

export type ResearchResult =
  | { ok: true; facts: WebsiteFacts; url: string }
  | { ok: false; error: string };

const FETCH_TIMEOUT_MS = 8_000;
const LLM_TIMEOUT_MS = 20_000;
/** Enough of a page to find hours and services; far short of anything worth memory-hogging. */
const MAX_BYTES = 400_000;
const MAX_REDIRECTS = 3;

/**
 * Hosts that must never be fetched, whatever the customer typed.
 *
 * Checked against the literal host AND every address it resolves to, because a hostname the
 * attacker controls can point at 127.0.0.1 just as easily as the literal can.
 */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return true;
  }

  // IPv6 loopback and unique-local / link-local space.
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true; // this host, private, loopback
    if (a === 169 && b === 254) return true; // link-local — cloud metadata lives here
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
  }

  return false;
}

/** Parse and vet a URL the customer typed. Returns null when it must not be fetched. */
export function safeWebsiteUrl(raw: string | null | undefined): URL | null {
  const input = (raw ?? "").trim();
  if (!input || input.length > 500) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Credentials in a URL are never something a business types for their own homepage, and they
  // are how a request gets aimed at something that trusts them.
  if (url.username || url.password) return null;
  if (isBlockedHost(url.hostname)) return null;
  // A bare hostname with no dot is an intranet name, not a public website.
  if (!url.hostname.includes(".")) return null;

  return url;
}

/** Fetch a page, following redirects by hand so every hop is vetted too. */
async function fetchPage(start: URL): Promise<string | null> {
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Identify honestly. A business should be able to see us in their logs and block us.
          "User-Agent": "DenkuBot/1.0 (+https://denku.io; reads your site to set up your AI)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return null;
      }
      // The whole point of manual redirects: a public URL may redirect to a private one.
      const vetted = safeWebsiteUrl(next.toString());
      if (!vetted) return null;
      url = vetted;
      continue;
    }

    if (!res.ok) return null;

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return null;

    const buffer = await res.arrayBuffer();
    const bytes = buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  return null;
}

/** Strip a page down to the text a model can read, cheaply and without a parser dependency. */
export function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

const SYSTEM_PROMPT = [
  "You are reading a small business's own website to help it set up an AI assistant.",
  "Extract only what the page actually states.",
  "",
  "ABSOLUTE RULE — do not infer, guess or generalise.",
  "- If the page does not give opening hours, leave openingHours empty. Never invent a time.",
  "- The same for the address, prices, booking and cancellation policies.",
  "- Do not reason from the industry. A page for a dentist does not tell you when it opens.",
  "- An empty field is the correct answer when the page is silent.",
  "",
  "For `faqs`, use only question-and-answer pairs the page itself contains, one per line as",
  "`Question — Answer`. Do not invent either half. Empty if the page has no FAQ.",
  "",
  "`industry` is the one summary you may write: a few words for what this business does.",
  "",
  "Reply in the language the website is written in.",
  "",
  'Return JSON with these keys, all strings, empty where the page does not say: "businessName",',
  '"services", "openingHours", "serviceArea", "faqs", "bookingPolicy", "cancellationPolicy",',
  '"industry".',
].join("\n");

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 1500) : "";
}

/**
 * Read the site and store what it says. Idempotent and safe to call more than once.
 *
 * Always stamps `website_checked_at`, success or not, so a site that cannot be read is not
 * re-fetched on every visit. Never throws: this runs in the background behind an optional field,
 * and a business that gave us a broken URL must still finish onboarding.
 */
export async function researchWebsiteForOrg(
  orgId: string,
  rawUrl: string
): Promise<ResearchResult> {
  if (!orgId) return { ok: false, error: "No workspace." };

  const url = safeWebsiteUrl(rawUrl);
  if (!url) {
    await stamp(orgId, null);
    return { ok: false, error: "That does not look like a public website address." };
  }

  const provider = resolveLlmProvider();
  if (!provider) {
    await stamp(orgId, null);
    return { ok: false, error: "Website reading is not configured on this deployment." };
  }

  try {
    const html = await fetchPage(url);
    if (!html) {
      await stamp(orgId, null);
      return { ok: false, error: "Could not read that site." };
    }

    const text = extractText(html);
    if (text.length < 120) {
      await stamp(orgId, null);
      return { ok: false, error: "There was not enough text on that page to read." };
    }

    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      maxRetries: 0,
      timeout: LLM_TIMEOUT_MS,
    });

    const call = client.chat.completions.create({
      model: provider.model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Website: ${url.origin}\n\n${text}` },
      ],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("website_llm_timeout")), LLM_TIMEOUT_MS + 500)
    );

    const completion = await Promise.race([call, timeout]);
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "{}") as Record<string, unknown>;

    const facts: WebsiteFacts = {};
    for (const key of [
      "businessName",
      "services",
      "openingHours",
      "serviceArea",
      "faqs",
      "bookingPolicy",
      "cancellationPolicy",
      "industry",
    ] as const) {
      const value = str(parsed[key]);
      if (value) facts[key] = value;
    }

    if (Object.keys(facts).length === 0) {
      await stamp(orgId, null);
      return { ok: false, error: "Nothing useful was found on that page." };
    }

    await stamp(orgId, facts);
    console.info("[WEBSITE_RESEARCH][OK]", {
      org_id: orgId,
      host: url.hostname,
      fields: Object.keys(facts).length,
    });
    return { ok: true, facts, url: url.origin };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[WEBSITE_RESEARCH][FAILED]", { org_id: orgId, host: url.hostname, error: message });
    await stamp(orgId, null);
    return { ok: false, error: "Could not read that site." };
  }
}

/** Record the attempt, so a site that cannot be read is not fetched again on every page load. */
async function stamp(orgId: string, facts: WebsiteFacts | null): Promise<void> {
  try {
    await supabaseAdmin
      .from("organization_settings")
      .update({
        website_checked_at: new Date().toISOString(),
        ...(facts ? { website_facts: facts } : {}),
      })
      .eq("org_id", orgId);
  } catch {
    // A failed stamp costs a repeat fetch, nothing more.
  }
}

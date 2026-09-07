import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { translateDashboardCopy } from "@/i18n/dashboardRuntime";
import { routing } from "@/i18n/routing";

/**
 * The authenticated product must not be half-translated.
 *
 * The dashboard is not localised at the call site: literal English lives in the components and the
 * locale boundary swaps it in the DOM against `DASHBOARD_COPY` (see `dashboardMessages.ts`). That
 * design has one failure mode, and on 2026-09-07 the whole product was in it — a workspace set to
 * Turkish read Turkish in the chrome and English everywhere the dictionary had no entry, which was
 * roughly half of what a customer could see. Nothing failed; the copy simply stayed English.
 *
 * So the source of truth is the source tree. This walks it with the TypeScript parser, collects
 * what a customer can actually read, and asserts the runtime has an answer for each. Anything new
 * and untranslated fails here rather than in front of a customer.
 */

const APP_ROOT = join(process.cwd(), "src", "app", "(app)");
const SHARED_ROOTS = [
  "analytics", "card", "charts", "dashboard", "dropdown", "horizon-shell",
  "progress", "tickets", "time", "ui", "ui-horizon", "workspace",
].map((dir) => join(process.cwd(), "src", "components", dir));

/** JSX attributes that carry copy. `name`/`value` are form plumbing, never text. */
const COPY_ATTRIBUTES = new Set([
  "placeholder", "title", "aria-label", "alt", "label", "description", "heading", "subtitle",
  "summary", "hint", "tooltip", "emptyTitle", "emptyBody", "helper", "helperText", "caption",
  "cta", "ctaLabel", "buttonLabel", "actionLabel", "confirmLabel", "cancelLabel", "message",
  "error", "header", "subheading", "note", "badge", "statusLabel", "legend", "body", "eyebrow",
]);

/** Object properties that carry copy — option tables, tab definitions, nav entries, results. */
const COPY_PROPERTIES = new Set([
  "label", "title", "description", "placeholder", "helper", "helperText", "hint", "tooltip",
  "message", "error", "heading", "subtitle", "subheading", "summary", "empty", "emptyTitle",
  "emptyBody", "cta", "ctaLabel", "buttonLabel", "actionLabel", "confirmLabel", "cancelLabel",
  "name", "caption", "note", "text", "body", "copy", "blurb", "eyebrow", "kicker", "header",
  "statusLabel", "badge", "detail", "details", "short", "long", "headline", "subtext", "question",
  "answer", "legend",
]);

/**
 * English that is allowed to stay English, with the reason.
 *
 * Four kinds only: copy in files nothing renders, example data and proper nouns, operator-facing
 * strings that never reach a screen, and words that are the same in all four languages. A new
 * entry here needs one of those four reasons — it is not a place to park untranslated copy.
 */
const ALLOWED_ENGLISH = new Set([
  // Unreachable components — kept in the tree, imported by nothing (verified 2026-09-07).
  "System Workload", "Current Load", "Throughput", "req/min", "Live Feed", "No recent activity.",
  "Go-Live Readiness", "Agent Performance Overview", "Hourly Calls", "Last 24 hours", "Today:",
  "Panel 1", "Panel 2", "Panel 3", "Panel 4", "Loading chart...",

  // Form field names and theme keys the parser cannot tell apart from copy.
  "areaCode", "businessDescription", "fullName", "lineType", "orgId", "productIntent",
  "saveGoalLanguage", "saveProductIntent", "workspaceName", "theme_headerBg", "theme_headerText",

  // Example addresses and domains shown as placeholders.
  "billing@yourbusiness.com", "info@yourbusiness.com", "info@yourcompany.com",
  "ops@yourbusiness.com", "teammate@yourbusiness.com", "yourbusiness.com", "yourcompany.com",
  "yourshop.com", "yourshop.myshopify.com", "yourshop.com yourshop.myshopify.com",
  "*.yourshop.com", "magazaniz.myideasoft.com", "www.", "</body>", "(pri",

  // Product and provider names.
  "Gmail", "Outlook", "IdeaSoft", "Instagram", "Instagram Business", "Telegram", "Vapi",
  "Netgsm (Türkiye)", "Main Line",

  // Operator-facing: log reasons and internal failures that never render as customer copy.
  "activation asked for a workspace that is already live — refused",
  "customer brings their own number — no US line provisioned",
  "workspace holds a voice plan against a non-voice intent — refusing to provision",
  "Checkout session created but no URL returned", "Invalid plan_code",
  "stripe_price_id not configured", "Provisioned line, waiting for number assignment",

  // Identical in all four languages, so the dictionary returns the source unchanged.
  "Model", "Normal", "Plan", "Tablet", "Web",
]);

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const NAMED_ENTITIES: Record<string, string> = {
  "&apos;": "'", "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
  "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’",
  "&mdash;": "—", "&ndash;": "–", "&hellip;": "…", "&middot;": "·",
};

/** JSX keeps entities; the DOM keeps the character, and the DOM is what the boundary matches. */
function decodeEntities(value: string): string {
  return value.replace(/&(?:[a-zA-Z]+|#\d+);/g, (match) => {
    if (NAMED_ENTITIES[match]) return NAMED_ENTITIES[match];
    const numeric = match.match(/^&#(\d+);$/);
    return numeric ? String.fromCodePoint(Number(numeric[1])) : match;
  });
}

/** Reject identifiers, slugs, class name blobs and URLs — anything that is not prose. */
function looksLikeCopy(text: string): boolean {
  if (text.length < 2 || !/[a-z]{2}/.test(text)) return false;
  if (/^https?:\/\//.test(text)) return false;
  if (/^[a-z0-9_-]+$/.test(text)) return false;
  if (/^[\w.-]+\.(tsx?|jsx?|json|css|png|svg)$/.test(text)) return false;
  if (/^(#|\.|\/|@|\$\{)/.test(text)) return false;
  if (/^[a-z-]+:[a-z0-9-]/.test(text) && !text.includes(" ")) return false;
  const tailwindish = /(flex|grid|text-|bg-|p[xytblr]?-|m[xytblr]?-|rounded|border|gap-|w-|h-|hover:|dark:|items-|justify-)/;
  if (
    text.includes(" ") &&
    /^[a-z0-9:_/[\]().,%#-]+( [a-z0-9:_/[\]().,%#-]+)*$/.test(text) &&
    tailwindish.test(text)
  ) {
    return false;
  }
  return true;
}

function collectCopy(file: string, into: Map<string, string>) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const record = (raw: string, node: ts.Node) => {
    const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
    if (!text || !looksLikeCopy(text) || into.has(text)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    into.set(text, `${relative(process.cwd(), file).replace(/\\/g, "/")}:${line + 1}`);
  };

  const literalText = (node: ts.Node): string | null =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      record(node.text, node);
    } else if (ts.isJsxAttribute(node) && COPY_ATTRIBUTES.has(node.name.getText(source))) {
      const init = node.initializer;
      const expression =
        init && ts.isJsxExpression(init) && init.expression ? init.expression : init;
      const text = expression ? literalText(expression) : null;
      if (text !== null && expression) record(text, expression);
    } else if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(source).replace(/^["']|["']$/g, "");
      const text = COPY_PROPERTIES.has(name) ? literalText(node.initializer) : null;
      if (text !== null) record(text, node.initializer);
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      const text = literalText(node.expression);
      if (text !== null) record(text, node.expression);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
}

const copy = new Map<string, string>();
for (const root of [APP_ROOT, ...SHARED_ROOTS]) {
  for (const file of sourceFiles(root)) collectCopy(file, copy);
}

const NON_ENGLISH = routing.locales.filter((locale) => locale !== "en");

describe("the authenticated product is translated, not half-translated", () => {
  it("finds copy to check in the first place", () => {
    // Guards against the walk silently matching nothing after a refactor.
    expect(copy.size).toBeGreaterThan(1000);
  });

  it.each(NON_ENGLISH)("%s has an answer for every string a customer can read", (locale) => {
    const dictionary = getDashboardDictionary(locale);
    const untranslated: string[] = [];

    for (const [text, where] of copy) {
      if (ALLOWED_ENGLISH.has(text)) continue;
      /*
       * A hit in the dictionary counts even when the translation reads the same as the source:
       * "Status" is "Status" in German and "Model" is "Model" in Turkish. What must never happen
       * is the boundary having no answer at all — that is the string a customer sees in English.
       */
      if (dictionary[text] !== undefined) continue;
      if (translateDashboardCopy(text, dictionary, locale) === text) {
        untranslated.push(`${where}  ${JSON.stringify(text)}`);
      }
    }

    expect(untranslated).toEqual([]);
  });
});

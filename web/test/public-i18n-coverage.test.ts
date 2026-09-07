import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import en from "../src/messages/en.json";

/**
 * The public site and the auth pages must read from the message files, not from the source.
 *
 * These trees are localised at the call site — `useTranslations` / `getTranslations` — so an
 * English literal here is not "a string waiting for a translation", it is a string that will be
 * English in all four languages forever. That is what /docs, /support, /use-cases, /contact and
 * the whole of /login were until 2026-09-07: fully rendered, fully indexed, fully English on
 * /tr and /de.
 *
 * The check is deliberately blunt — every user-visible literal must appear somewhere in
 * `en.json` — because the alternative (proving a given literal reaches `t()`) needs type
 * information this harness does not have. A string that is in the message files but hardcoded
 * anyway slips through; a brand new one does not.
 */

const ROOTS = [
  join(process.cwd(), "src", "app", "[locale]"),
  join(process.cwd(), "src", "app", "(auth)"),
  join(process.cwd(), "src", "components", "marketing"),
  join(process.cwd(), "src", "components", "auth"),
];

const COPY_ATTRIBUTES = new Set([
  "placeholder", "title", "aria-label", "alt", "label", "description", "heading", "subtitle",
  "summary", "hint", "tooltip", "helper", "helperText", "caption", "cta", "message", "body",
]);

const COPY_PROPERTIES = new Set([
  "label", "title", "description", "placeholder", "hint", "message", "heading", "subtitle",
  "summary", "cta", "caption", "note", "body", "desc", "question", "answer", "level", "q", "a",
  "name", "text",
]);

/**
 * Literals allowed to stay in the source: names, and files nothing renders.
 * Anything else belongs in `src/messages/*.json`.
 */
const ALLOWED_LITERALS = new Set([
  "Ava", "Iris", "Dana M.", "Denku.", "Google", "Facebook",
]);

/** Components kept in the tree but imported by nothing — the pre-V3 landing (verified 2026-09-07). */
const UNREACHABLE = new Set([
  "Button.tsx", "ComparePlans.tsx", "Contact.tsx", "DemoCallout.tsx", "HowItWorks.tsx",
  "InlineBanner.tsx", "LiveAgentInline.tsx", "LiveAgentModal.tsx", "OutcomesStrip.tsx",
  "Pricing.tsx", "ProductPreview.tsx", "ProofBar.tsx", "SectionHeader.tsx", "Security.tsx",
  "SecurityTeaser.tsx", "TalkToAgentHero.tsx", "UseCases.tsx", "WhyDenku.tsx", "final-cta.tsx",
  "hero-premium.tsx", "hero.tsx", "how-it-works.tsx", "pricing-preview.tsx", "pricing-table.tsx",
  "process-steps.tsx", "social-proof.tsx", "trust-scale.tsx", "use-cases.tsx",
  "InfographicRow.tsx", "PanelMock.tsx", "SlaComparisonCard.tsx", "StatusChip.tsx",
  "VisualAccordion.tsx", "Waveform.tsx",
  // The holding page and the action only it calls.
  "VerifyEmailHoldingPage.tsx", "resendSignupEmail.ts",
  // Plan names, prices and capacity lines; the live pricing surfaces read their copy from
  // the message files and take only the numbers from here.
  "pricing-data.ts",
]);

const NAMED_ENTITIES: Record<string, string> = {
  "&apos;": "'", "&amp;": "&", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&nbsp;": " ",
  "&ldquo;": "“", "&rdquo;": "”", "&lsquo;": "‘", "&rsquo;": "’",
  "&mdash;": "—", "&ndash;": "–", "&hellip;": "…", "&middot;": "·",
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:[a-zA-Z]+|#\d+);/g, (match) => {
    if (NAMED_ENTITIES[match]) return NAMED_ENTITIES[match];
    const numeric = match.match(/^&#(\d+);$/);
    return numeric ? String.fromCodePoint(Number(numeric[1])) : match;
  });
}

function looksLikeCopy(text: string): boolean {
  if (text.length < 2 || !/[a-z]{2}/.test(text)) return false;
  if (/^https?:\/\//.test(text)) return false;
  if (/^[a-z0-9_-]+$/.test(text)) return false;
  if (/^[\w.-]+\.(tsx?|jsx?|json|css|png|svg)$/.test(text)) return false;
  if (/^(#|\.|\/|@|\$\{)/.test(text)) return false;
  if (/^[a-z-]+:[a-z0-9-]/.test(text) && !text.includes(" ")) return false;
  const tailwindish = /(flex|grid|text-|bg-|p[xytblr]?-|m[xytblr]?-|rounded|border|gap-|w-|h-|hover:|dark:|items-|justify-|radial-gradient|inset-)/;
  if (
    text.includes(" ") &&
    /^[a-z0-9:_/[\]().,%#-]+( [a-z0-9:_/[\]().,%#-]+)*$/.test(text) &&
    tailwindish.test(text)
  ) {
    return false;
  }
  return true;
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !UNREACHABLE.has(entry.name)) found.push(full);
  }
  return found;
}

/** Every string anywhere in the English message tree, whitespace-normalised. */
const TRANSLATED = new Set<string>();
(function collect(node: unknown) {
  if (typeof node === "string") {
    TRANSLATED.add(node.replace(/\s+/g, " ").trim());
    return;
  }
  if (node && typeof node === "object") Object.values(node).forEach(collect);
})(en);

const literals = new Map<string, string>();
let filesScanned = 0;

for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    filesScanned += 1;
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );

    const record = (raw: string, node: ts.Node) => {
      const text = decodeEntities(raw).replace(/\s+/g, " ").trim();
      if (!text || !looksLikeCopy(text) || literals.has(text)) return;
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      literals.set(text, `${relative(process.cwd(), file).replace(/\\/g, "/")}:${line + 1}`);
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
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }
}

describe("the public site and auth read from the message files", () => {
  it("actually walked the trees", () => {
    /*
     * Counts files, not strings. Strings are the thing being driven to zero — asserting a
     * floor on them would mean this test starts failing as the job succeeds.
     */
    expect(filesScanned).toBeGreaterThan(80);
  });

  it("has no user-visible English outside src/messages", () => {
    const hardcoded: string[] = [];
    for (const [text, where] of literals) {
      if (ALLOWED_LITERALS.has(text)) continue;
      if (!TRANSLATED.has(text)) hardcoded.push(`${where}  ${JSON.stringify(text)}`);
    }
    expect(hardcoded).toEqual([]);
  });
});

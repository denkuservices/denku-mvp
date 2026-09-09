import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Text has to be readable on the colour it is actually painted on.
 *
 * Nothing else in this suite looks at colour, which is how two live surfaces shipped with their
 * main action below the WCAG AA floor. The cause is the same both times: `--s-cta-bg` and
 * `--s-accent` are BUTTON colours in the warm theme (dark navy, teal) and are remapped on the
 * marketing surface (copper `#C89468`, teal `#2FA39A`) — so a `text-white` written against the
 * warm palette becomes white-on-copper the moment the dark surface applies.
 *
 * Measured in a browser on the built site, 2026-09-09:
 *
 *   white on copper (--s-cta-bg)   2.66:1   ← the three verify-email buttons
 *   white on teal   (--s-accent)   3.08:1   ← the /use-cases CTA
 *   dark  on copper (--s-cta-fg)   7.03:1   ← what every other auth button uses
 *   dark  on teal                  6.08:1
 *
 * AA wants 4.5 for body-sized text. The paired token — `--s-cta-fg` — clears it on both grounds
 * and on the hover and active states too, which is why it is the answer rather than a new colour.
 */

const SEP = String.fromCharCode(92);

const ROOTS = [
  join(process.cwd(), "src", "app", "[locale]"),
  join(process.cwd(), "src", "app", "(auth)"),
  join(process.cwd(), "src", "components", "marketing"),
  join(process.cwd(), "src", "components", "auth"),
];

/**
 * Components kept in the tree but imported by nothing. Same list this suite already keeps in
 * `public-i18n-coverage.test.ts`; a dead file cannot fail a customer.
 */
const UNREACHABLE = new Set([
  "ComparePlans.tsx", "Pricing.tsx", "WhyDenku.tsx", "VerifyEmailHoldingPage.tsx",
  "pricing-preview.tsx", "pricing-table.tsx", "hero.tsx", "hero-premium.tsx",
  "use-cases.tsx", "UseCases.tsx", "ProductPreview.tsx", "Contact.tsx", "DemoCallout.tsx",
  "HowItWorks.tsx", "how-it-works.tsx", "Security.tsx", "SecurityTeaser.tsx", "ProofBar.tsx",
  "OutcomesStrip.tsx", "TalkToAgentHero.tsx", "LiveAgentInline.tsx", "LiveAgentModal.tsx",
  "InlineBanner.tsx", "SectionHeader.tsx", "Button.tsx", "final-cta.tsx", "process-steps.tsx",
  "social-proof.tsx", "trust-scale.tsx", "SlaComparisonCard.tsx", "VisualAccordion.tsx",
  "InfographicRow.tsx", "PanelMock.tsx", "StatusChip.tsx", "Waveform.tsx",
]);

/** Backgrounds that are dark-text surfaces once the marketing palette applies. */
const DARK_TEXT_GROUNDS = ["bg-[var(--s-cta-bg)]", "bg-[var(--s-accent)]"];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (/\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Every `className="..."` / className={`...`} value in a file. */
function classAttributes(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

describe("marketing and auth text is readable on the colour it is painted on", () => {
  const sources = ROOTS.flatMap((root) => files(root))
    .filter((f) => !UNREACHABLE.has(f.split(SEP).join("/").split("/").pop()!))
    .map((f) => [f, readFileSync(f, "utf8")] as const);

  it("finds the surfaces to check", () => {
    expect(sources.length).toBeGreaterThan(20);
  });

  it("never puts white text on the copper or teal button grounds", () => {
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      for (const cls of classAttributes(source)) {
        if (!/(^|\s)text-white(\s|$)/.test(cls)) continue;
        const ground = DARK_TEXT_GROUNDS.find((g) => cls.includes(g));
        if (ground) {
          offenders.push(`${relative(process.cwd(), file).split(SEP).join("/")}  ${ground} + text-white`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the CTA background a button colour, never a panel", () => {
    /*
     * `--s-cta-bg` on a large container is what made the /use-cases CTA a copper plate on a
     * near-black page, with both controls inside it styled for the dark ground they no longer
     * stood on. It belongs on the button.
     */
    const offenders: string[] = [];
    for (const [file, source] of sources) {
      for (const cls of classAttributes(source)) {
        if (!cls.includes("bg-[var(--s-cta-bg)]")) continue;
        const isPanel = /(^|\s)(p-8|p-10|p-12|md:p-12|rounded-\[24px\]|max-w-3xl)(\s|$)/.test(cls);
        if (isPanel) {
          offenders.push(`${relative(process.cwd(), file).split(SEP).join("/")}  ${cls.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const MARKETING_COMPONENTS = path.join(SRC, "components", "marketing");
const MARKETING_PAGES = path.join(SRC, "app", "(marketing)");
const SITE_CONFIG = path.join(SRC, "config", "site.ts");

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(full)) out.push(full);
  }
  return out;
}

const files = [
  ...walk(MARKETING_COMPONENTS),
  ...walk(MARKETING_PAGES),
  SITE_CONFIG,
].filter((f) => fs.existsSync(f));

const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, "/");

/**
 * R-004 / F-012 — MARKETING HONESTY (D0-D).
 *
 * Denku holds **no** SOC 2 or HIPAA certification. Claiming one — or implying it with
 * "enterprise-grade" as a compliance signal, or selling HIPAA as a plan feature — is legal
 * exposure, not a copy preference. `docs/MARKETING_HONESTY_DRAFT.md` catalogued every instance;
 * D0-D removed them.
 *
 * These tests exist because copy regresses more quietly than code: a future landing page, a
 * pricing tier, or a reinstated component can reintroduce a certification claim without anyone
 * reading this file. The assertion is deliberately narrow — a claim is allowed **only** when the
 * sentence explicitly negates it ("not yet certified", "not SOC 2 or HIPAA certified") — so the
 * honest disclaimers survive and the claims cannot come back.
 *
 * When Denku is actually certified, delete the relevant case. Do not weaken it to make copy pass.
 */
describe("R-004 · marketing states no compliance Denku does not hold", () => {
  // A mention is honest only if the same line disclaims it.
  const DISCLAIMED = /not yet certified|not\s+(?:soc\s?2|hipaa)|on our roadmap, not|are on our roadmap/i;

  it("no marketing surface claims SOC 2", () => {
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/soc[\s-]?2/i.test(line) && !DISCLAIMED.test(line)) {
            offenders.push(`${rel(f)}:${i + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it("no marketing surface claims or sells HIPAA", () => {
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/hipaa/i.test(line) && !DISCLAIMED.test(line)) {
            offenders.push(`${rel(f)}:${i + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('no marketing surface uses "enterprise-grade" as a compliance signal', () => {
    // The phrase reads as "audited to an enterprise standard" to a US buyer running a security
    // review. Describe the control instead (encryption, tenant scoping, webhook auth).
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/enterprise[\s-]grade/i.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("R-018 · marketing states no metric Denku has not measured", () => {
  it("the invented dashboard figures are labelled as sample data", () => {
    // ProductPreview renders nine invented metrics across three tabs. They are a legitimate
    // illustration of the interface — but only while the frame says so rather than asserting
    // numbers as fact. (docs/denku-2.0/17: "real-UI frames with labeled sample data".)
    const preview = path.join(MARKETING_COMPONENTS, "ProductPreview.tsx");
    if (!fs.existsSync(preview)) return; // component retired — nothing to assert
    const body = fs.readFileSync(preview, "utf8");
    expect(body).toMatch(/Sample data/i);
  });

  it("no marketing surface asserts an uncited success-rate or missed-call percentage", () => {
    // The two known fabrications were "Success Rate 98.5%" and "misses 35% of inbound calls".
    // Any percentage sitting next to these words is a factual claim about the world or about
    // Denku's performance, and must be either sourced or removed.
    const CLAIM =
      /(success rate|misses?|missed)[^.\n]{0,40}\d{1,3}(\.\d+)?\s?%|\d{1,3}(\.\d+)?\s?%[^.\n]{0,40}(success rate|of inbound calls)/i;
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (CLAIM.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("R-004 · marketing does not promise absolutes the product cannot guarantee", () => {
  it('the site description does not guarantee "book every appointment"', () => {
    const body = fs.readFileSync(SITE_CONFIG, "utf8");
    expect(body).not.toMatch(/book every appointment/i);
  });

  it('no marketing surface calls the product "omnichannel"', () => {
    // Today: voice is production-ready and Instagram is receive-only. "Omnichannel" is the
    // platform's direction, not its current state (CLAUDE.md, platform direction note).
    const offenders: string[] = [];
    for (const f of files) {
      fs.readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/omnichannel/i.test(line)) offenders.push(`${rel(f)}:${i + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});

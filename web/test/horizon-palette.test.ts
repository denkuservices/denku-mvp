import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GLOBALS = path.join(ROOT, "src", "app", "globals.css");
const CONFIG = path.join(ROOT, "tailwind.config.ts");
const BUNDLE = path.join(ROOT, "public", "horizon", "horizon.bundle.css");

const read = (p: string) => fs.readFileSync(p, "utf8");
const hex = (s: string) => s.trim().toLowerCase();

/**
 * THE HORIZON PALETTE HAS TWO DECLARATIONS AND ONE TRUTH.
 *
 * `globals.css`'s `@theme` block is what Tailwind v4 compiles; `tailwind.config.ts` is loaded via
 * `@config` for the v3-era tokens the vendored Horizon components reference. Both name the same
 * colours, and when they disagree the CSS wins silently.
 *
 * That is not hypothetical. The config was corrected to Horizon's real values and the built
 * stylesheet still shipped Tailwind's default blue, because the `@theme` block still held the old
 * guess — a fix applied to the source that loses. The mismatch was invisible in the browser too,
 * since the unlayered bundle overrides both for any class Horizon itself compiled (R-136).
 *
 * So: the two declarations must agree, and both must match the bundle they are copied from.
 */

/** `--color-brand-500: #422afb;` → { "brand-500": "#422afb" } */
function paletteFromThemeBlock(): Record<string, string> {
  const css = read(GLOBALS);
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-(brand|navy|background)-(\d+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    out[`${m[1]}-${m[2]}`] = hex(m[3]);
  }
  const lp = css.match(/--color-lightPrimary\s*:\s*(#[0-9a-fA-F]{3,8})/);
  if (lp) out["lightPrimary"] = hex(lp[1]);
  return out;
}

/** `500: '#422afb',` inside the `brand: { … }` block → { "brand-500": "#422afb" } */
function paletteFromConfig(): Record<string, string> {
  const ts = read(CONFIG);
  const out: Record<string, string> = {};
  for (const family of ["navy", "brand", "background"]) {
    const block = ts.match(new RegExp(`${family}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`));
    if (!block) continue;
    for (const m of block[1].matchAll(/(\d+)\s*:\s*'(#[0-9a-fA-F]{3,8})'/g)) {
      out[`${family}-${m[1]}`] = hex(m[2]);
    }
  }
  const lp = ts.match(/lightPrimary:\s*'(#[0-9a-fA-F]{3,8})'/);
  if (lp) out["lightPrimary"] = hex(lp[1]);
  return out;
}

/** What Horizon's own compiled CSS says a token is: `.bg-brand-500{…rgb(66 42 251…)}`. */
function paletteFromBundle(): Record<string, string> {
  const css = read(BUNDLE);
  const out: Record<string, string> = {};
  for (const m of css.matchAll(
    /(brand|navy)-(\d+)[^{]*\{[^}]*?(?:background-color|color|border-color):\s*rgb\((\d+)\s+(\d+)\s+(\d+)/g
  )) {
    const key = `${m[1]}-${m[2]}`;
    const value =
      "#" + [m[3], m[4], m[5]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    // First occurrence wins; the bundle repeats a token across bg/text/border rules.
    if (!out[key]) out[key] = hex(value);
  }
  return out;
}

describe("the Horizon palette has one truth", () => {
  const theme = paletteFromThemeBlock();
  const config = paletteFromConfig();
  const bundle = paletteFromBundle();

  it("both declarations were found (the parsers still match the files)", () => {
    // A silent parse failure would make every assertion below vacuously pass.
    expect(Object.keys(theme).length).toBeGreaterThan(5);
    expect(Object.keys(config).length).toBeGreaterThan(5);
    expect(Object.keys(bundle).length).toBeGreaterThan(5);
    expect(theme["brand-500"]).toBeTruthy();
    expect(config["brand-500"]).toBeTruthy();
  });

  it("globals.css and tailwind.config.ts agree on every shade they both declare", () => {
    const disagreements: string[] = [];
    for (const key of Object.keys(theme)) {
      if (config[key] && config[key] !== theme[key]) {
        disagreements.push(`${key}: globals.css ${theme[key]} vs config ${config[key]}`);
      }
    }
    expect(disagreements).toEqual([]);
  });

  it("both match the vendored bundle they are copied from", () => {
    const wrong: string[] = [];
    for (const [key, expected] of Object.entries(bundle)) {
      if (theme[key] && theme[key] !== expected) wrong.push(`globals.css ${key}: ${theme[key]} ≠ ${expected}`);
      if (config[key] && config[key] !== expected) wrong.push(`config ${key}: ${config[key]} ≠ ${expected}`);
    }
    expect(wrong).toEqual([]);
  });

  it("brand-500 is Horizon indigo, not Tailwind blue", () => {
    // The specific regression that shipped: #3b82f6 is Tailwind's default blue-500.
    expect(theme["brand-500"]).toBe("#422afb");
    expect(config["brand-500"]).toBe("#422afb");
    expect(theme["brand-500"]).not.toBe("#3b82f6");
  });

  it("the navy scale is not shifted a step", () => {
    // The old config put #0b1437 — Horizon's navy-900 — at navy-700.
    expect(theme["navy-700"]).toBe("#1b254b");
    expect(theme["navy-900"]).toBe("#0b1437");
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const DASHBOARD = path.join(SRC, "app", "(app)", "dashboard");

/** Strip block and line comments so a rule is tested against code, never against prose about it. */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = walk(DASHBOARD).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join("/"),
  body: fs.readFileSync(file, "utf8"),
}));

/**
 * The narrowest screen the product is used on. Everything below is measured against a 375px
 * viewport minus the shell's own horizontal padding.
 */
const MOBILE_CONTENT_WIDTH = 343;

describe("the dashboard shell must not destroy what it cannot fit", () => {
  // Comments stripped: this asserts on what the shell DOES, and the note explaining the choice
  // names the class it rejects.
  const shell = stripComments(
    fs.readFileSync(path.join(SRC, "components", "horizon-shell", "HorizonShell.tsx"), "utf8")
  );

  it("scrolls overflow rather than clipping it", () => {
    /*
     * `overflow-x-hidden` on the scroll container was quietly destructive on a phone: content
     * wider than the screen was cut off with no scrollbar and no sign anything was missing —
     * reported by a customer as "the information slides off". On a desktop nothing was ever wide
     * enough to notice, so the flaw lived exactly where nobody testing it was looking.
     */
    expect(shell).toMatch(/overflow-x-auto/);
    expect(shell).not.toMatch(/overflow-x-hidden/);
  });
});

describe("anything wider than a phone carries its own scroller", () => {
  it("wraps every fixed min-width block in a horizontal scroll container", () => {
    const offenders: string[] = [];

    for (const { rel, body } of FILES) {
      const lines = body.split("\n");
      lines.forEach((line, index) => {
        const match = line.match(/min-w-\[(\d+)px\]/);
        if (!match) return;
        if (Number(match[1]) <= MOBILE_CONTENT_WIDTH) return;

        // A wide block is fine when something above it can scroll sideways. Looking back a few
        // lines is enough: the wrapper is always the element that opens immediately before.
        const context = lines.slice(Math.max(0, index - 6), index + 1).join("\n");
        if (!/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(context)) {
          offenders.push(`${rel}:${index + 1} — ${match[0]}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it("gives every table somewhere to scroll", () => {
    const offenders: string[] = [];

    for (const { rel, body } of FILES) {
      const lines = body.split("\n");
      lines.forEach((line, index) => {
        if (!line.includes("<table")) return;
        const context = lines.slice(Math.max(0, index - 6), index + 1).join("\n");
        if (!/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(context)) {
          offenders.push(`${rel}:${index + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

describe("multi-column grids collapse on a narrow screen", () => {
  it("never forces three or more columns at phone width", () => {
    /*
     * Two columns at 375px is a deliberate and common choice — stat tiles read fine that way.
     * Three or more is not: it leaves under 110px a column, which is narrower than the shortest
     * useful input. A responsive prefix anywhere on the line means the base value was chosen, not
     * inherited by accident.
     */
    const offenders: string[] = [];

    for (const { rel, body } of FILES) {
      body.split("\n").forEach((line, index) => {
        const base = line.match(/(?:^|[\s"'`])grid-cols-([3-9]|1[0-2])(?:[\s"'`]|$)/);
        if (!base) return;
        if (/(sm|md|lg|xl|2xl):grid-cols-/.test(line)) return;
        offenders.push(`${rel}:${index + 1} — grid-cols-${base[1]}`);
      });
    }

    // The month calendar is the one honest exception: seven columns IS the thing, and it lives
    // inside its own `min-w-[760px]` scroller (asserted above).
    const unexpected = offenders.filter((o) => !o.includes("RequestCalendar.tsx"));
    expect(unexpected).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (relativePath: string) => fs.readFileSync(path.join(SRC, relativePath), "utf8");

/** Every .tsx under a directory, so a new file cannot dodge these rules by being new. */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const APP_TSX = walk(path.join(SRC, "app", "(app)"));
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, "/");

describe("authenticated surfaces share the Horizon design language", () => {
  it("keeps consumer class names without replacing the Card chrome", () => {
    const card = read("components/ui-horizon/card.tsx");

    expect(card).toMatch(/className=\{cn\(/);
    expect(card).toMatch(/extra,/);
    expect(card).toMatch(/className\s*\)/);
    expect(card).toMatch(/border-gray-200\/70/);
  });

  it("routes every platform page header through the shared Horizon primitive", () => {
    expect(read("app/(app)/dashboard/_platform/PageHeader.tsx")).toMatch(
      /ui-horizon\/page-header/
    );
  });

  it("uses the shared focus treatment for the calls filter toolbar", () => {
    const toolbar = read("app/(app)/dashboard/calls/_components/FilterToolbar.tsx");

    expect(toolbar).toMatch(/ui-horizon\/controls/);
    expect(toolbar).not.toMatch(/indigo-/);
  });

  it("uses real Horizon actions on the legacy AI directory instead of coming-soon controls", () => {
    const directory = read("app/(app)/dashboard/agents/AgentsClient.tsx");
    const detail = read("app/(app)/dashboard/agents/[agentId]/page.tsx");

    expect(directory).toMatch(/ui-horizon\/controls/);
    expect(directory).toMatch(/ui-horizon\/card/);
    expect(directory).not.toMatch(/coming soon|requires backend support/i);
    expect(detail).toMatch(/ui-horizon\/page-header/);
    expect(detail).toMatch(/ui-horizon\/table/);
  });
});

/**
 * ONE DEFINITION PER RECIPE.
 *
 * The first pass at this migration produced the exact thing it set out to remove: a second
 * `CONTROL_CLASS`, in a second file, under the same name and with a different look
 * (`rounded-xl`/`shadow-sm`/`ring-4`/`navy-900` against `rounded-lg`/`ring-2`/`navy-800`). Three
 * pages wore one and forty-odd wore the other, and nothing could notice — not the type checker, not
 * the build, not the previous version of this file, which asserted that individual pages imported
 * the right module and never that the module was the only one of its kind.
 *
 * So these tests assert the shape of the SYSTEM rather than the imports of a page: a recipe is
 * declared once, and everything else references it.
 */
describe("a design recipe is declared exactly once", () => {
  it("declares the form-control chrome only in components/ui-horizon/controls", () => {
    const declarations = [...APP_TSX, path.join(SRC, "components")]
      .flatMap((p) => (fs.statSync(p).isDirectory() ? walk(p) : [p]))
      .filter((file) => /export const CONTROL_CLASS\s*=/.test(fs.readFileSync(file, "utf8")))
      .map(rel);

    expect(declarations).toEqual(["components/ui-horizon/controls.tsx"]);
  });

  it("re-exports it to the platform surfaces rather than restating it", () => {
    const platform = read("app/(app)/dashboard/_platform/ui/index.tsx");

    expect(platform).toMatch(/export \{ CONTROL_CLASS \} from "@\/components\/ui-horizon\/controls"/);
    // The tell that a copy has come back: a second literal recipe in this file.
    expect(platform).not.toMatch(/h-10 rounded-lg border border-gray-200 bg-white/);
  });

  it("keeps the platform pill, empty state and stat as thin layers over the shared ones", () => {
    const platform = read("app/(app)/dashboard/_platform/ui/index.tsx");

    // Names the call sites like, drawing what everything else draws.
    expect(platform).toMatch(/<Badge\b/);
    expect(platform).toMatch(/<HorizonEmptyState\b/);
    expect(platform).toMatch(/<Stat\b/);
    // If these come back, two components called EmptyState are drawing different things again.
    expect(platform).not.toMatch(/rounded-full bg-gray-100 dark:bg-white\/10/);
    expect(platform).not.toMatch(/const tones: Record<string, string>/);
  });

  it("exposes the button and notice recipes from the components that own them", () => {
    // A class-string escape hatch is fine — a COPIED class string is not. These are built from the
    // same maps the components compose, so the two can never drift.
    const button = read("components/ui-horizon/button.tsx");
    expect(button).toMatch(/export function horizonButtonClass/);
    expect(button).toMatch(/return cn\(base, variants\[variant\], sizes\[size\], className\)/);

    const notice = read("components/ui-horizon/notice.tsx");
    expect(notice).toMatch(/export const DANGER_NOTICE_CLASS = cn\(/);
    expect(notice).toMatch(/tones\.danger\.box/);
  });
});

/**
 * NO SURFACE LEFT ON THE OLD LANGUAGE.
 *
 * `zinc-` is the shadcn-era palette that predates Horizon on the authenticated side, and `indigo-`
 * was the starter-template accent. Scanned across every `.tsx` under `(app)` rather than a
 * hand-listed set of files, because the previous version of this test listed five files and the
 * sixth — a form still reachable at `/dashboard/crm/requests/new` — sat on the old palette for
 * weeks without anything noticing.
 */
describe("no authenticated surface carries the pre-Horizon palette", () => {
  it("has no zinc- utilities left", () => {
    const offenders = APP_TSX.filter((f) => /\bzinc-\d/.test(fs.readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("uses indigo only as an avatar tint, never as a control accent", () => {
    const offenders = APP_TSX.filter((f) => /\bindigo-\d/.test(fs.readFileSync(f, "utf8"))).map(rel);
    // Avatar.tsx rotates a palette of tints for initials — that is colour as identity, not chrome.
    expect(offenders).toEqual(["app/(app)/dashboard/_platform/Avatar.tsx"]);
  });
});

/**
 * THE CHANNEL CARDS.
 *
 * Four sibling screens reached from the same Channels menu. Instagram was migrated and the other
 * three were not, so a customer clicking through them saw the same card drawn two ways — and the
 * three un-migrated ones each carried their own copy of the input, button and error-box chrome,
 * with no focus ring on any of the inputs.
 */
describe("every channel card is drawn from the shared primitives", () => {
  const CARDS = [
    "app/(app)/dashboard/channels/instagram/_components/InstagramConnectionCard.tsx",
    "app/(app)/dashboard/channels/telegram/_components/TelegramConnectionCard.tsx",
    "app/(app)/dashboard/channels/email/_components/EmailConnectionCard.tsx",
    "app/(app)/dashboard/channels/web/_components/WebChatCard.tsx",
  ];

  it.each(CARDS)("%s hand-rolls no control, button or error chrome", (file) => {
    const source = read(file);

    expect(source).not.toMatch(/rounded-lg border border-gray-200 bg-white px-3 py-2/);
    expect(source).not.toMatch(/rounded-lg bg-brand-500 px-4 py-2/);
    expect(source).not.toMatch(/rounded-xl border border-red-200 bg-red-50 px-4 py-3/);
  });

  it.each(CARDS)("%s draws from ui-horizon", (file) => {
    expect(read(file)).toMatch(/@\/components\/ui-horizon\//);
  });
});

/**
 * The control recipe fixes a ONE-LINE height, and a textarea is not one line.
 *
 * Caught while migrating the channel cards: swapping a hand-rolled `px-3 py-2` input chrome for
 * `CONTROL_CLASS` also hands the element `h-10`, which silently collapses a `rows={3}` textarea to
 * a single row. The markup still says `rows`, the type checker is happy, and the field just stops
 * showing what it was built to show — the Web Chat origin allowlist, which is a list.
 *
 * Composing `h-auto py-2` is the fix. This is the rule that stops the next migration re-breaking
 * it, and it is worth a test precisely because nothing else fails when it is wrong.
 */
describe("a textarea is never locked to the control's fixed height", () => {
  it("pairs h-auto with CONTROL_CLASS on every textarea", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/<textarea\b[\s\S]*?\/>/g)) {
        const block = match[0];
        if (block.includes("CONTROL_CLASS") && !block.includes("h-auto")) {
          offenders.push(`${rel(file)}:${source.slice(0, match.index).split("\n").length}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

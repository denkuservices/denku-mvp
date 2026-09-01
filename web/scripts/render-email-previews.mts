/**
 * Render every transactional email to `web/.email-previews/` for design review.
 *
 *   npx vite-node --config vitest.config.ts scripts/render-email-previews.mts
 *
 * Why a script as well as the dev route: reviewing mail means opening a dozen files side
 * by side, dragging one into a real client to check Outlook, or attaching them to a
 * design discussion — none of which a running server makes easy. The index it writes
 * (`index.html`) shows all of them in one scrolling gallery.
 *
 * Output is gitignored. Nothing here sends anything.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Render links against the canonical host rather than localhost, so the previews match
// what a customer receives.
process.env.NEXT_PUBLIC_SITE_URL ||= "https://www.denku.io";
process.env.NEXT_PUBLIC_APP_URL ||= "https://www.denku.io";

const { emailPreviews } = await import("../src/lib/email/previewSamples");
const { EMAIL_COLORS, EMAIL_FONTS } = await import("../src/lib/email/brand");

const outDir = join(process.cwd(), ".email-previews");
mkdirSync(outDir, { recursive: true });

const previews = emailPreviews();

for (const preview of previews) {
  writeFileSync(join(outDir, `${preview.key}.html`), preview.html, "utf8");
}

// A machine-readable index beside the HTML: label, subject, trigger and source for each
// email, for anything that wants to build its own view of the estate.
writeFileSync(
  join(outDir, "_meta.json"),
  JSON.stringify(
    previews.map(({ key, label, trigger, source, subject }) => ({ key, label, trigger, source, subject })),
    null,
    2
  ),
  "utf8"
);

const cards = previews
  .map(
    (p) => `<section>
      <header>
        <h2>${p.label}</h2>
        <p class="subject">${p.subject}</p>
        <p class="meta">${p.trigger}</p>
        <p class="meta mono">${p.source}</p>
      </header>
      <iframe src="./${p.key}.html" title="${p.label}"></iframe>
    </section>`
  )
  .join("\n");

const index = `<!doctype html><html><head><meta charset="utf-8"><title>Denku email estate</title>
<style>
  body { margin:0; padding:48px 32px; background:${EMAIL_COLORS.boneRaised}; color:${EMAIL_COLORS.inkText}; font-family:${EMAIL_FONTS.body}; }
  h1 { font-family:${EMAIL_FONTS.display}; font-weight:400; font-size:34px; margin:0 0 4px; }
  .lede { color:${EMAIL_COLORS.muted}; margin:0 0 40px; }
  section { margin:0 0 56px; }
  h2 { font-family:${EMAIL_FONTS.display}; font-weight:400; font-size:22px; margin:0 0 4px; }
  .subject { margin:0 0 4px; font-size:14px; color:${EMAIL_COLORS.teal}; }
  .meta { margin:0; font-size:12px; color:${EMAIL_COLORS.muted}; }
  .mono { font-family:${EMAIL_FONTS.mono}; }
  iframe { width:100%; max-width:720px; height:820px; border:1px solid ${EMAIL_COLORS.line}; border-radius:12px; background:#fff; margin-top:16px; }
</style></head>
<body><h1>Denku email estate</h1>
<p class="lede">${previews.length} transactional emails, rendered from the real templates.</p>
${cards}</body></html>`;

writeFileSync(join(outDir, "index.html"), index, "utf8");

console.log(`Rendered ${previews.length} email previews → ${outDir}`);

import { NextResponse } from "next/server";
import { emailPreviews, findEmailPreview } from "@/lib/email/previewSamples";
import { EMAIL_COLORS as C, EMAIL_FONTS as F, EMAIL_LOGO_CID, EMAIL_LOGO_URL, esc } from "@/lib/email/brand";

/**
 * Dev-only preview of every transactional email.
 *
 * `/api/dev/email-preview` lists the estate; `?t=<key>` renders one exactly as it will
 * arrive. Nothing is sent — this returns HTML, so it costs no Resend quota and cannot
 * reach a customer.
 *
 * 404s in production, like the other `/api/dev/*` routes. (Note the standing rule from
 * CLAUDE.md landmine #2: no `/api/debug/*` routes. This is `/api/dev`, it is committed
 * and reviewable, and it leaks nothing — the sample data is literal.)
 */

export const dynamic = "force-dynamic";

function indexPage(): string {
  const rows = emailPreviews()
    .map(
      (p) => `<tr>
        <td><a href="?t=${encodeURIComponent(p.key)}">${esc(p.label)}</a></td>
        <td>${esc(p.subject)}</td>
        <td class="muted">${esc(p.trigger)}</td>
        <td class="mono muted">${esc(p.source)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Denku email estate</title>
  <style>
    body { background:${C.bone}; color:${C.inkText}; font-family:${F.body}; margin:0; padding:48px 32px; }
    h1 { font-family:${F.display}; font-weight:400; font-size:32px; margin:0 0 6px; }
    p.lede { color:${C.muted}; margin:0 0 32px; font-size:14px; }
    table { border-collapse:collapse; width:100%; max-width:1100px; font-size:13px; }
    th { text-align:left; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:${C.muted}; padding:0 16px 10px 0; }
    td { padding:12px 16px 12px 0; border-top:1px solid ${C.line}; vertical-align:top; }
    a { color:${C.teal}; }
    .muted { color:${C.muted}; }
    .mono { font-family:${F.mono}; font-size:12px; }
  </style></head><body>
  <h1>Denku email estate</h1>
  <p class="lede">${emailPreviews().length} transactional emails. Click one to see exactly what lands in the inbox.</p>
  <table><thead><tr><th>Email</th><th>Subject</th><th>When it sends</th><th>Source</th></tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
}

/**
 * The masthead mark, made visible in a browser.
 *
 * A real send attaches the PNG and the masthead points at it with `cid:denku-mark` — that is the
 * whole reason the mark now survives a client that blocks remote images. A browser has no message
 * and therefore no attachment, so the preview would show a broken image on all 21 emails and
 * whoever opened it would go looking for a bug that is not there.
 *
 * Swapping the reference for the deployed URL renders the same file, so the preview still answers
 * the question it exists to answer: what does this email look like. It does NOT prove the
 * attachment works — that only an actual inbox can, which is what `test/email-design.test.ts`
 * pins instead.
 */
function browserViewable(html: string): string {
  return html.split(`cid:${EMAIL_LOGO_CID}`).join(EMAIL_LOGO_URL);
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get("t");
  if (!key) {
    return new NextResponse(indexPage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const preview = findEmailPreview(key);
  if (!preview) {
    return NextResponse.json({ ok: false, error: `Unknown template: ${key}` }, { status: 404 });
  }

  return new NextResponse(browserViewable(preview.html), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

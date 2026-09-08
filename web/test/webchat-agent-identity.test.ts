import { describe, it, expect, vi } from "vitest";

// `branding.ts` imports the fail-fast service-role client at module load; nothing here touches a DB.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } } }));

import {
  DEFAULT_AVATAR_URL,
  avatarExtension,
  avatarUrlFor,
  isOwnedAvatar,
  looksLikeImage,
} from "@/lib/webchat/branding";
import { WIDGET_LOCALES, widgetCopy } from "@/lib/webchat/copy";

/**
 * The widget now shows a face and a role, and both are things a business types or uploads.
 *
 * Two failure modes are worth a test rather than a review. The first is the picture becoming a
 * way to serve something that is not a picture, from Denku's own origin, into a frame that holds
 * a visitor's session token. The second is the quieter one: a shop uploads a new logo, the URL
 * does not change, and every browser that ever loaded the widget keeps showing the old one — a
 * bug that reads to the customer as "it didn't save".
 */

describe("the widget's face", () => {
  it("is an image format a browser draws, and never an SVG", () => {
    expect(avatarExtension("image/png")).toBe("png");
    expect(avatarExtension("image/jpeg")).toBe("jpg");
    expect(avatarExtension("image/webp")).toBe("webp");
    expect(avatarExtension("IMAGE/PNG; charset=binary")).toBe("png");

    // An SVG is a document with script in it. Served same-origin from /api/webchat/avatar it
    // would be script in the frame that holds the visitor's session token.
    expect(avatarExtension("image/svg+xml")).toBeNull();
    expect(avatarExtension("text/html")).toBeNull();
    expect(avatarExtension("application/pdf")).toBeNull();
    expect(avatarExtension(null)).toBeNull();
  });

  it("reads the bytes, because the declared type is whatever the uploader said it was", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(8)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);

    expect(looksLikeImage("image/png", png)).toBe(true);
    expect(looksLikeImage("image/jpeg", jpg)).toBe(true);
    expect(looksLikeImage("image/webp", webp)).toBe(true);

    // `logo.png` that is actually HTML: accepted on its filename, refused on its content.
    expect(looksLikeImage("image/png", Buffer.from("<!doctype html><script>x</script>"))).toBe(false);
    // A real PNG declared as something else is still not an avatar — the two must agree.
    expect(looksLikeImage("image/webp", png)).toBe(false);
    expect(looksLikeImage("image/png", Buffer.alloc(4))).toBe(false);
  });

  it("only points at a key inside this install's own folder", () => {
    expect(isOwnedAvatar("org-1/webchat/branding/c1/a.png", "org-1", "c1")).toBe(true);
    // Another workspace's file, another install's file, and the classic escape.
    expect(isOwnedAvatar("org-2/webchat/branding/c1/a.png", "org-1", "c1")).toBe(false);
    expect(isOwnedAvatar("org-1/webchat/branding/c2/a.png", "org-1", "c1")).toBe(false);
    expect(isOwnedAvatar("org-1/webchat/branding/c1/../../../secrets.png", "org-1", "c1")).toBe(false);
    // A visitor's own upload is not branding, even though it is in the same bucket and org.
    expect(isOwnedAvatar("org-1/webchat/sess-1/a.png", "org-1", "c1")).toBe(false);
    expect(isOwnedAvatar(null, "org-1", "c1")).toBe(false);
  });

  it("falls back to the built-in agent, and that asset is on our own origin", () => {
    const url = avatarUrlFor({ siteKey: "dkweb_abc", avatarPath: null });
    expect(url).toBe(DEFAULT_AVATAR_URL);
    // The embed document's CSP is `img-src 'self' data:`. A default on any other host would
    // render as a broken image on every install that had not uploaded one.
    expect(url.startsWith("/")).toBe(true);
  });

  it("changes address when the picture changes, so nothing serves yesterday's logo", () => {
    const first = avatarUrlFor({ siteKey: "dkweb_abc", avatarPath: "o/webchat/branding/c/aaa.png" });
    const second = avatarUrlFor({ siteKey: "dkweb_abc", avatarPath: "o/webchat/branding/c/bbb.png" });

    expect(first).toContain("/api/webchat/avatar/dkweb_abc");
    expect(first).not.toBe(second);
    // The address is site-key based: no identifier a visitor did not already have from the page
    // source, and stable across everything except the picture itself.
    expect(second).toContain("v=bbb");
  });
});

describe("the widget speaks the visitor's language", () => {
  it("has every string in every language it ships in", () => {
    const keys = Object.keys(widgetCopy("en"));
    expect(keys.length).toBeGreaterThan(10);

    for (const locale of WIDGET_LOCALES) {
      const copy = widgetCopy(locale) as unknown as Record<string, string>;
      for (const key of keys) {
        expect(copy[key], `${locale}.${key}`).toBeTruthy();
      }
    }
  });

  it("is Turkish for a Turkish visitor, and English for a locale nobody configured", () => {
    expect(widgetCopy("tr").send).toBe("Gönder");
    // The chrome used to be English for everybody, under a conversation the AI held in Turkish.
    expect(widgetCopy("tr").placeholder).not.toBe(widgetCopy("en").placeholder);
    // Unknown, missing and junk all mean English — never a blank Send button.
    expect(widgetCopy("fr")).toEqual(widgetCopy("en"));
    expect(widgetCopy(null)).toEqual(widgetCopy("en"));
  });

  it("keeps the count placeholder the widget substitutes", () => {
    for (const locale of WIDGET_LOCALES) {
      expect(widgetCopy(locale).attachments).toContain("{n}");
    }
  });

  it("offers documents and video, because the upload endpoint now accepts them", () => {
    // The sentence a visitor reads when they pick the wrong kind of file has to match what the
    // server actually takes, or it teaches them to stop trying.
    for (const locale of WIDGET_LOCALES) {
      expect(widgetCopy(locale).errUnsupported.length).toBeGreaterThan(10);
    }
    expect(widgetCopy("en").errUnsupported).toContain("video");
    expect(widgetCopy("en").errUnsupported).toContain("document");
    // No byte figure in the "too big" line: the ceiling is per kind now, and a sentence naming
    // one number would be wrong for three of the four.
    for (const locale of WIDGET_LOCALES) {
      expect(widgetCopy(locale).errTooLarge).not.toMatch(/\d+\s?(MB|Mo)/i);
    }
  });
});

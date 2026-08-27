import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The recording play button (2026-08-27).
 *
 * It broke without a single error anywhere: Vapi made recording storage access-controlled, and
 * the `<audio>` tag was pointed straight at the raw storage URL. These tests pin the two halves
 * of the fix — the browser asks US, and we are the only ones holding the key.
 */
describe("call recording playback", () => {
  const route = read("src/app/api/calls/[callId]/recording/route.ts");

  it("never hands the Vapi private key to the browser", () => {
    const rail = read("src/app/(app)/dashboard/_platform/conversation/ContextRail.tsx");
    expect(rail).not.toMatch(/VAPI_API_KEY/);
    // The player must point at our own route, never at Vapi/Cloudflare storage.
    expect(rail).toMatch(/src=\{voice\.playbackUrl\}/);
    expect(rail).not.toMatch(/voice\.recordingUrl/);
  });

  it("proves the call belongs to the caller's org before signing anything", () => {
    expect(route).toMatch(/getActiveOrgId/);
    expect(route).toMatch(/\.eq\("org_id", orgId\)/);
  });

  it("asks Vapi for a fresh signed URL rather than reusing the stored one", () => {
    expect(route).toMatch(/mono-recording/);
    expect(route).toMatch(/stereo-recording/);
    expect(route).toMatch(/redirect: "manual"/);
    expect(route).toMatch(/Authorization: `Bearer \$\{key\}`/);
  });

  it("does not cache a URL that expires", () => {
    expect(route).toMatch(/no-store/);
  });

  it("only offers a player when a recording actually exists", () => {
    const model = read("src/lib/platform/readModel/voiceArtifacts.ts");
    expect(model).toMatch(/playbackUrl: recordingUrl \? `\/api\/calls\/\$\{callId\}\/recording` : null/);
  });
});

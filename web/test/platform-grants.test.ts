import { describe, it, expect, vi } from "vitest";

/*
 * Everything asserted below is a PURE function, but each lives in a module that also holds the
 * service-role client — which fails fast at import time when the environment has no Supabase URL,
 * exactly as it should in production. Stubbing the client is what lets the rules be tested without
 * standing up a database around them; nothing here ever reaches it.
 */
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { parsePlatformAdmins, isPlatformAdminEmail } from "@/lib/platform-admin/access";
import { isGrantLive, summarizeGrants, trialVoiceStatus, type GrantRow } from "@/lib/billing/grants";
import { validateGrantInput, GRANT_LIMITS, MAX_GRANT_DAYS } from "@/lib/platform-admin/grantService";
import { bucketFor } from "@/lib/platform-admin/metrics";
import { pauseBlocksTelephony, customerMayResume, PAUSED_REASONS } from "@/lib/workspace/pauseReasons";

/**
 * The platform console hands out capacity nobody paid for and, on one path, spends real money.
 * Every rule below is one where being wrong costs something specific: a customer locked out of a
 * trial they were given, a rented number nobody releases, a stranger reading the revenue figures.
 */

const NOW = new Date("2026-09-09T12:00:00.000Z");

function grant(over: Partial<GrantRow> = {}): GrantRow {
  return {
    id: "g1",
    org_id: "org-1",
    kind: "voice_minutes",
    amount: 30,
    starts_at: "2026-09-08T00:00:00.000Z",
    expires_at: "2026-09-15T00:00:00.000Z",
    status: "active",
    note: null,
    granted_by: null,
    created_at: "2026-09-08T00:00:00.000Z",
    ...over,
  };
}

describe("who may open the platform console", () => {
  it("admits the configured operator", () => {
    const list = parsePlatformAdmins("adkirikci@gmail.com");
    expect(isPlatformAdminEmail("adkirikci@gmail.com", true, list)).toBe(true);
  });

  it("ignores case and surrounding whitespace, which a login form will not normalise for us", () => {
    const list = parsePlatformAdmins(" AdKirikci@Gmail.com , someone@else.com ");
    expect(isPlatformAdminEmail("adkirikci@gmail.com", true, list)).toBe(true);
    expect(isPlatformAdminEmail("someone@else.com", true, list)).toBe(true);
  });

  it("refuses an unconfirmed address, because an unconfirmed address is a claim", () => {
    const list = parsePlatformAdmins("adkirikci@gmail.com");
    expect(isPlatformAdminEmail("adkirikci@gmail.com", false, list)).toBe(false);
  });

  it("refuses everybody else", () => {
    const list = parsePlatformAdmins("adkirikci@gmail.com");
    expect(isPlatformAdminEmail("attacker@gmail.com", true, list)).toBe(false);
    expect(isPlatformAdminEmail(null, true, list)).toBe(false);
    expect(isPlatformAdminEmail("", true, list)).toBe(false);
  });

  it("falls back to the owner when the environment configures nothing, rather than to nobody", () => {
    // An empty allowlist would lock the platform owner out of their own billing analytics with no
    // way back in short of a deploy. The env var still overrides this entirely.
    expect(parsePlatformAdmins(undefined)).toEqual(["adkirikci@gmail.com"]);
    expect(parsePlatformAdmins("   ")).toEqual(["adkirikci@gmail.com"]);
  });
});

describe("when a grant is in force", () => {
  it("counts a grant inside its window", () => {
    expect(isGrantLive(grant(), NOW)).toBe(true);
  });

  it("stops counting the moment it expires, without waiting for a sweep", () => {
    // The whole safety argument for granting capacity: entitlement is read from the dates, so a
    // cron that has not run cannot leave somebody holding what they no longer have.
    expect(isGrantLive(grant({ expires_at: "2026-09-09T11:59:59.000Z" }), NOW)).toBe(false);
  });

  it("does not count one that has not started", () => {
    expect(isGrantLive(grant({ starts_at: "2026-09-10T00:00:00.000Z" }), NOW)).toBe(false);
  });

  it("treats a revoked grant as dead immediately — nobody paid, so nothing is owed", () => {
    expect(isGrantLive(grant({ status: "revoked" }), NOW)).toBe(false);
  });

  it("treats an unparseable date as no grant, not as an open-ended one", () => {
    expect(isGrantLive(grant({ expires_at: "whenever" }), NOW)).toBe(false);
  });
});

describe("folding grants into capacity", () => {
  it("sums each kind separately", () => {
    const out = summarizeGrants(
      [
        grant({ id: "a", kind: "voice_minutes", amount: 30 }),
        grant({ id: "b", kind: "chat_slots", amount: 1 }),
        grant({ id: "c", kind: "phone_numbers", amount: 1 }),
      ],
      NOW
    );
    expect(out.voiceMinutes).toBe(30);
    expect(out.chatSlots).toBe(1);
    expect(out.phoneNumbers).toBe(1);
  });

  it("adds topped-up minutes but keeps counting from the EARLIEST grant", () => {
    // Moving the consumption window to the newer grant would silently forgive everything already
    // spent — a 30-minute trial topped up by 30 would become unlimited, one top-up at a time.
    const out = summarizeGrants(
      [
        grant({ id: "a", starts_at: "2026-09-08T00:00:00.000Z", amount: 30 }),
        grant({ id: "b", starts_at: "2026-09-09T09:00:00.000Z", amount: 30 }),
      ],
      NOW
    );
    expect(out.voiceMinutes).toBe(60);
    expect(out.voiceMinutesSince).toBe("2026-09-08T00:00:00.000Z");
  });

  it("counts down to the SOONEST expiry", () => {
    const out = summarizeGrants(
      [
        grant({ id: "a", expires_at: "2026-09-20T00:00:00.000Z" }),
        grant({ id: "b", kind: "chat_slots", amount: 1, expires_at: "2026-09-12T00:00:00.000Z" }),
      ],
      NOW
    );
    expect(out.endsAt).toBe("2026-09-12T00:00:00.000Z");
  });

  it("grants nothing for a kind it does not recognise", () => {
    const out = summarizeGrants([grant({ kind: "free_ponies", amount: 500 })], NOW);
    expect(out.voiceMinutes).toBe(0);
    expect(out.chatSlots).toBe(0);
    expect(out.phoneNumbers).toBe(0);
  });

  it("ignores a negative or unparseable amount rather than subtracting capacity", () => {
    const out = summarizeGrants(
      [grant({ id: "a", amount: -100 }), grant({ id: "b", kind: "chat_slots", amount: "abc" })],
      NOW
    );
    expect(out.voiceMinutes).toBe(0);
    expect(out.chatSlots).toBe(0);
  });
});

describe("the trial minute cap", () => {
  it("is not active when nothing was granted", () => {
    expect(trialVoiceStatus(0, 0, null).active).toBe(false);
  });

  it("reports what is left", () => {
    const s = trialVoiceStatus(30, 11, null);
    expect(s.remaining).toBe(19);
    expect(s.exhausted).toBe(false);
  });

  it("is exhausted exactly at the allowance, not one minute past it", () => {
    expect(trialVoiceStatus(30, 30, null).exhausted).toBe(true);
  });

  it("never reports negative remaining minutes when a call overshoots the cap", () => {
    // The overshoot is structural: Denku learns a call's length after it ends, so the call that
    // crosses the line always completes. The number shown must still make sense.
    const s = trialVoiceStatus(30, 41, null);
    expect(s.exhausted).toBe(true);
    expect(s.remaining).toBe(0);
  });
});

describe("what an operator is allowed to type into the grant form", () => {
  it("accepts the ordinary trial", () => {
    expect(validateGrantInput({ kind: "voice_minutes", amount: 30, days: 7 })).toEqual({
      ok: true,
      kind: "voice_minutes",
    });
  });

  it("refuses an unknown kind", () => {
    expect(validateGrantInput({ kind: "free_ponies", amount: 1, days: 1 }).ok).toBe(false);
  });

  it("refuses zero and negative amounts", () => {
    expect(validateGrantInput({ kind: "voice_minutes", amount: 0, days: 7 }).ok).toBe(false);
    expect(validateGrantInput({ kind: "voice_minutes", amount: -30, days: 7 }).ok).toBe(false);
  });

  it("caps each kind, because the difference between 30 and 3000 is one keystroke", () => {
    expect(validateGrantInput({ kind: "voice_minutes", amount: GRANT_LIMITS.voice_minutes.max, days: 7 }).ok).toBe(true);
    expect(validateGrantInput({ kind: "voice_minutes", amount: GRANT_LIMITS.voice_minutes.max + 1, days: 7 }).ok).toBe(
      false
    );
  });

  it("keeps the phone-number ceiling tightest — it is the only kind that spends money", () => {
    expect(GRANT_LIMITS.phone_numbers.max).toBeLessThanOrEqual(2);
    expect(validateGrantInput({ kind: "phone_numbers", amount: 3, days: 7 }).ok).toBe(false);
  });

  it("refuses a grant with no end, and one that outlives a year", () => {
    expect(validateGrantInput({ kind: "chat_slots", amount: 1, days: 0 }).ok).toBe(false);
    expect(validateGrantInput({ kind: "chat_slots", amount: 1, days: MAX_GRANT_DAYS + 1 }).ok).toBe(false);
  });
});

describe("which bucket a workspace's spend belongs to", () => {
  it("counts a paying customer as a customer", () => {
    expect(bucketFor({ isInternal: false, hasVoicePlan: true, hasLiveGrant: false })).toBe("customer");
  });

  it("counts a granted workspace with no plan as a trial", () => {
    expect(bucketFor({ isInternal: false, hasVoicePlan: false, hasLiveGrant: true })).toBe("trial");
  });

  it("counts a Denku workspace as internal even when it holds a grant", () => {
    // Otherwise Denku's own demo spend would inflate "prospects trying the product" with ourselves.
    expect(bucketFor({ isInternal: true, hasVoicePlan: false, hasLiveGrant: true })).toBe("internal");
  });

  it("counts a workspace with a plan as a customer even while a grant runs alongside it", () => {
    expect(bucketFor({ isInternal: false, hasVoicePlan: true, hasLiveGrant: true })).toBe("customer");
  });
});

describe("the pause vocabulary", () => {
  it("includes the trial reason, so a trial pause is a sentence the database accepts", () => {
    expect(PAUSED_REASONS).toContain("trial_ended");
  });

  it("takes the phones down for EVERY reason, including one nobody has added yet", () => {
    // The bug this pins: `enforcePause` used to enumerate three reasons inline, so a fourth read as
    // "not really paused" — a workspace paused in the dashboard that kept answering calls.
    for (const reason of PAUSED_REASONS) expect(pauseBlocksTelephony(reason)).toBe(true);
    expect(pauseBlocksTelephony("something_invented_later")).toBe(true);
    expect(pauseBlocksTelephony(null)).toBe(false);
  });

  it("lets a trial workspace resume itself, but never one that owes money", () => {
    expect(customerMayResume("trial_ended")).toBe(true);
    expect(customerMayResume("manual")).toBe(true);
    expect(customerMayResume("hard_cap")).toBe(false);
    expect(customerMayResume("past_due")).toBe(false);
  });
});

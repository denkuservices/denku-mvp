import { NextRequest, NextResponse } from 'next/server';
import { demoAssistantOverrides } from '@/lib/marketing/demoCall';

/**
 * API Route: /api/vapi/start
 *
 * Environment Variables Required (Server-side only):
 * - VAPI_API_KEY: Private API key for server-side Vapi operations (never exposed)
 * - VAPI_DENKU_ASSISTANT_ID: Denku's own assistant (optional — falls back to the literal below)
 *
 * ⚠️ `VAPI_AGENT_ID` is DEAD as of 2026-09-03 and must never be read again. It HELD
 * `155b21ad…`, the old customer-shaped demo assistant, and was deleted from Vercel the same day.
 * The rename is what made this commit real: had the route kept reading that name, repointing the
 * landing page would have been a silent no-op in production while looking correct in the diff.
 * If you are tempted to "restore" the old variable name, that is the trap.
 *
 * Client-side Requirements:
 * - NEXT_PUBLIC_VAPI_PUBLIC_KEY: Public key from Vapi dashboard (safe to expose)
 *
 * Flow:
 * 1. Client calls this route with the locale the page is being read in
 * 2. Client uses NEXT_PUBLIC_VAPI_PUBLIC_KEY to initialize Vapi Web SDK
 * 3. Client starts the call with assistantId + assistantOverrides
 * 4. VAPI_API_KEY stays server-side (used by /lib/vapi/server.ts for admin operations)
 *
 * The overrides are built HERE rather than in the browser because they come from the language
 * registry (`lib/language/registry.ts`), which decides what Denku can hear and speak. That
 * decision should not be restatable — or contradictable — by client code.
 */

/**
 * Denku's OWN assistant — server-side only, never in the client bundle.
 *
 * Until 2026-09-03 this pointed at `155b21ad…`, which is a customer-shaped assistant called
 * "Denku Inbound MVP" belonging to the pilot org, filled in as though Denku were a client named
 * "Pilot Client". It was doing three jobs at once: the landing page demo, a real phone line
 * (+13213369681), and Denku's salesperson. Its prompt was typed by hand and had gone stale where
 * nobody could see — four languages reported as two, and no knowledge of Telegram, Email, Web
 * Chat, BYON, the commerce integration, or three of the four things Denku sells.
 *
 * `a7846579…` is a dedicated assistant whose prompt is GENERATED from the registries and whose
 * product knowledge comes from `search_denku_knowledge` at call time, so neither can go stale.
 * `155b21ad…` keeps its phone line and is untouched — splitting the jobs is most of the fix.
 *
 * Regenerate it with `scripts/register-denku-agent.mts` after a channel flips or a price changes.
 * The env var wins so an environment can point at its own copy without a deploy; the literal is
 * the id that script created, kept here so the demo works with nothing configured.
 */
const MARKETING_AGENT_ID =
  process.env.VAPI_DENKU_ASSISTANT_ID || 'a7846579-78b9-451a-8821-2c5764a3fc6f';

export async function POST(req: NextRequest) {
  try {
    // Body is optional on purpose: an older client (or a cached bundle mid-deploy) posts nothing
    // and must still get a working call, in English.
    const body = await req.json().catch(() => null);
    const locale = typeof body?.locale === 'string' ? body.locale : null;

    return NextResponse.json({
      assistantId: MARKETING_AGENT_ID,
      // Per-call only. The demo assistant is a shared, live object — it also answers a real phone
      // number — so the language is applied as an override and the assistant itself is untouched.
      assistantOverrides: demoAssistantOverrides(locale),
    });
  } catch (error: any) {
    console.error('Vapi start error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start agent session' },
      { status: 500 }
    );
  }
}

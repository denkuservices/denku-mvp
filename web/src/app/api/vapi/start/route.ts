import { NextRequest, NextResponse } from 'next/server';
import { demoAssistantOverrides } from '@/lib/marketing/demoCall';

/**
 * API Route: /api/vapi/start
 *
 * Environment Variables Required (Server-side only):
 * - VAPI_API_KEY: Private API key for server-side Vapi operations (never exposed)
 * - VAPI_AGENT_ID: Marketing agent ID (can also be hardcoded constant)
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

// Marketing demo agent ID - server-side only
// NEVER expose this to the client bundle
// Can also use process.env.VAPI_AGENT_ID if preferred
const MARKETING_AGENT_ID = process.env.VAPI_AGENT_ID || '155b21ad-2f8b-4593-b33c-c5021e644328';

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

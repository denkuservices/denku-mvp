import { NextRequest, NextResponse } from 'next/server';

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
 * 1. Client calls this route to get the assistantId
 * 2. Client uses NEXT_PUBLIC_VAPI_PUBLIC_KEY to initialize Vapi Web SDK
 * 3. Client starts call with assistantId using Web SDK
 * 4. VAPI_API_KEY stays server-side (used by /lib/vapi/server.ts for admin operations)
 */

// Marketing demo agent ID - server-side only
// NEVER expose this to the client bundle
// Can also use process.env.VAPI_AGENT_ID if preferred
const MARKETING_AGENT_ID = process.env.VAPI_AGENT_ID || '155b21ad-2f8b-4593-b33c-c5021e644328';

export async function POST(req: NextRequest) {
  try {
    // Return ONLY the assistantId for the Web SDK to use
    // The Web SDK will handle the call creation client-side using the public key
    // This keeps VAPI_API_KEY server-side while allowing the client to start calls
    
    // Note: Vapi Web SDK requires a public key (NEXT_PUBLIC_VAPI_PUBLIC_KEY, safe to expose) to initialize
    // The assistantId is returned here but could be considered semi-public
    // For maximum security, consider using Vapi's token-based auth if available
    
    return NextResponse.json({
      assistantId: MARKETING_AGENT_ID,
    });
  } catch (error: any) {
    console.error('Vapi start error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to start agent session' },
      { status: 500 }
    );
  }
}

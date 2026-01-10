'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Environment Variables Required:
 * 
 * Client-side (exposed to browser):
 * - NEXT_PUBLIC_VAPI_PUBLIC_KEY: Public key from Vapi dashboard (safe to expose)
 * 
 * Server-side (never exposed):
 * - VAPI_API_KEY: Private API key for server-side Vapi operations
 * - VAPI_AGENT_ID: Marketing agent ID (returned from /api/vapi/start)
 */

// Dynamic import for Vapi Web SDK to avoid SSR issues
let Vapi: any = null;

// Deterministic waveform heights (no Math.random)
const BAR_HEIGHTS = [22, 34, 28, 40, 26, 38, 30, 44, 27, 36, 31, 42];

type CallState = 'idle' | 'connecting' | 'live' | 'error' | 'not-configured';

export function TalkToAgentHero() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);

  // Derived boolean for live state
  const isLive = callState === 'live';

  // Check if public key is configured on mount (client-side only)
  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setCallState('not-configured');
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[TalkToAgentHero] NEXT_PUBLIC_VAPI_PUBLIC_KEY is not configured. ' +
          'Voice demo will not be available. Add it to your .env.local file.'
        );
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        try {
          // Stop call if active
          vapiRef.current.stop();
          // Remove all event listeners
          vapiRef.current.off?.('call-start');
          vapiRef.current.off?.('call-end');
          vapiRef.current.off?.('error');
        } catch (e) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      }
    };
  }, []);

  const handleStart = async () => {
    // Check if public key is configured before starting
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setCallState('not-configured');
      setError('Voice demo is not configured yet.');
      return;
    }

    // Wait for Vapi SDK to load if needed
    if (!Vapi) {
      try {
        const module = await import('@vapi-ai/web');
        Vapi = module.default;
      } catch (e) {
        setError('Failed to load agent SDK. Please refresh the page.');
        setCallState('error');
        return;
      }
    }

    setCallState('connecting');
    setError(null);

    try {
      // Request assistantId from our API (keeps agentId server-side)
      // The API route uses VAPI_API_KEY server-side (never exposed to client)
      const res = await fetch('/api/vapi/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to start session');
      }

      const { assistantId } = await res.json();

      if (!assistantId) {
        throw new Error('No assistant ID returned');
      }

      // Initialize Vapi Web SDK with public key (safe to expose, used for Web SDK auth)
      // The public key is different from VAPI_API_KEY and is safe to include in client bundle
      const vapi = new Vapi(publicKey);
      
      // Start call with assistantId (returned from our secure API)
      vapi.start(assistantId);

      // Set up event handlers (these will be cleaned up on unmount)
      vapi.on('call-start', () => {
        setCallState('live');
        setError(null);
      });

      vapi.on('call-end', () => {
        setCallState('idle');
        setError(null);
        // Clean up event listeners
        try {
          vapi.off?.('call-start');
          vapi.off?.('call-end');
          vapi.off?.('error');
        } catch (e) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      });

      vapi.on('error', (e: any) => {
        console.error('Vapi error:', e);
        setError('Connection error. Please try again.');
        setCallState('error');
        // Clean up on error
        try {
          vapi.off?.('call-start');
          vapi.off?.('call-end');
          vapi.off?.('error');
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      });

      vapiRef.current = vapi;
    } catch (err: any) {
      console.error('Start error:', err);
      setError(err?.message || 'Agent is unavailable. Please try again later.');
      setCallState('error');
    }
  };

  const handleStop = () => {
    if (vapiRef.current) {
      try {
        // Stop the call using Vapi SDK stop method
        vapiRef.current.stop();
        // State will be updated via 'call-end' event listener
      } catch (err: any) {
        console.error('Stop error:', err);
        setError('Failed to end call. Please try again.');
        setCallState('error');
        // Fallback: manually reset state if stop fails
        try {
          vapiRef.current.off?.('call-start');
          vapiRef.current.off?.('call-end');
          vapiRef.current.off?.('error');
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
        setCallState('idle');
      }
    }
  };

  const handleButtonClick = () => {
    if (isLive) {
      handleStop();
    } else if (callState === 'idle') {
      handleStart();
    }
  };

  // Get aria-label based on state
  const getAriaLabel = () => {
    switch (callState) {
      case 'idle':
        return 'Start voice demo';
      case 'live':
        return 'Stop voice demo';
      case 'connecting':
        return 'Connecting to voice demo';
      case 'error':
        return 'Voice demo error - try again';
      default:
        return 'Voice demo';
    }
  };

  return (
    <div className="relative flex flex-col items-center mt-6" style={{ minHeight: '100px' }}>
      {/* Equalizer decoration - behind button */}
      <div className="absolute inset-0 flex items-end justify-center gap-1.5 z-0 pb-2" style={{ height: '80px' }}>
        {BAR_HEIGHTS.map((height, i) => (
          <div
            key={i}
            className="w-1 rounded-t"
            style={{
              height: `${height}px`,
              backgroundColor: 'rgba(255, 255, 255, 0.25)',
              animation: 'breath 3.5s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>

      {/* Main CTA Button */}
      <button
        onClick={handleButtonClick}
        disabled={callState === 'connecting' || callState === 'not-configured'}
        aria-label={getAriaLabel()}
        className="group relative z-10 flex items-center justify-center gap-2 h-16 min-w-[280px] px-8 rounded-full bg-[#0F1115] text-white border border-white/8 transition-all hover:bg-[#161A22] hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        style={{
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        }}
        onMouseDown={(e) => {
          if (callState === 'idle' || callState === 'live') {
            e.currentTarget.style.boxShadow = 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)';
          }
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
        }}
        onKeyDown={(e) => {
          // Allow Enter and Space to trigger action
          if (e.key === 'Enter' || e.key === ' ') {
            if (callState === 'live') {
              e.preventDefault();
              handleStop();
            } else if (callState === 'idle') {
              e.preventDefault();
              handleStart();
            }
          }
        }}
      >
        {callState === 'connecting' ? (
          <>
            <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-base font-medium">Connecting...</span>
          </>
        ) : isLive ? (
          <>
            {/* Default label: Green dot + "Live" */}
            <span className="absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-200 group-hover:opacity-0">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-base font-medium">Live</span>
            </span>
            {/* Hover label: "PRESS TO STOP" */}
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="text-base font-medium tracking-wider">PRESS TO STOP</span>
            </span>
          </>
        ) : (
          <>
            <span className="text-base">🎤</span>
            <span className="text-base font-medium">TALK TO DENKU AI</span>
          </>
        )}
      </button>

      {/* Helper text */}
      {callState === 'idle' && (
        <p className="mt-3 text-xs text-[#64748B]">
          Live voice demo · No signup
        </p>
      )}

      {/* Error or configuration message */}
      {callState === 'not-configured' && (
        <p className="mt-3 text-xs text-[#64748B]">
          Voice demo is not configured yet.
        </p>
      )}

      {error && callState === 'error' && (
        <p className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

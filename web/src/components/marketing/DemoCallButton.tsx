'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Premium Call Button Component
 * 
 * Features:
 * - Starts Vapi web call with hardcoded assistant ID
 * - 5-minute duration limit (auto-ends silently)
 * - Rate limiting: enforced by backend via /api/webcall/event (10 starts per 10 minutes)
 * - Minimal UI: no countdown timers, no demo language
 * - Warning shown only in last 1 minute of call
 */

// Dynamic import for Vapi Web SDK to avoid SSR issues
let Vapi: any = null;

const DEMO_ASSISTANT_ID = '155b21ad-2f8b-4593-b33c-c5021e644328';
const MAX_CALL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD_MS = 60 * 1000; // Show warning in last 1 minute

type CallState = 'idle' | 'connecting' | 'live' | 'error';

export function DemoCallButton() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitCooldown, setRateLimitCooldown] = useState(false);
  const vapiRef = useRef<any>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const rateLimitCooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const vapiCallIdRef = useRef<string | null>(null); // Real Vapi call ID (e.g., "019bb...")
  const callStartTimeRef = useRef<number | null>(null);
  const isEndingRef = useRef<boolean>(false);

  // Cleanup timers and call on unmount
  useEffect(() => {
    return () => {
      if (durationTimerRef.current) {
        clearTimeout(durationTimerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
      if (warningCountdownRef.current) {
        clearInterval(warningCountdownRef.current);
      }
      if (rateLimitCooldownTimerRef.current) {
        clearTimeout(rateLimitCooldownTimerRef.current);
      }
      // Safe cleanup on unmount
      if (vapiRef.current) {
        isEndingRef.current = false; // Reset flag for cleanup
        safeStopCall();
        try {
          vapiRef.current.off?.('call-start');
          vapiRef.current.off?.('call-end');
          vapiRef.current.off?.('error');
        } catch (e) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      }
        // Clean up call tracking refs
        callIdRef.current = null;
        vapiCallIdRef.current = null;
        callStartTimeRef.current = null;
    };
  }, []);

  /**
   * Safely stop the Vapi call with defensive guards for Krisp/WASM cleanup.
   * Idempotent: can be called multiple times safely.
   */
  const safeStopCall = () => {
    // Prevent double teardown
    if (isEndingRef.current || !vapiRef.current) {
      return;
    }

    isEndingRef.current = true;

    try {
      // Check if vapi instance exists and has stop method
      if (vapiRef.current && typeof vapiRef.current.stop === 'function') {
        vapiRef.current.stop();
      }
    } catch (err: any) {
      // Catch Krisp/WASM errors specifically
      const errorMessage = err?.message || String(err);
      const isKrispError = errorMessage.includes('krisp') || 
                           errorMessage.includes('Krisp') ||
                           errorMessage.includes('WASM') ||
                           errorMessage.includes('worker') ||
                           errorMessage.includes('processor');
      
      if (isKrispError) {
        // Log Krisp-specific error with structured format
        console.info('[WEBCALL][AUDIO][KRISP_UNLOAD_SKIPPED]', { 
          reason: errorMessage.includes('NOT_READY') ? 'WASM_OR_WORKER_NOT_READY' : 'UNLOAD_ERROR',
          error: errorMessage,
        });
      } else {
        // Log other stop errors (but don't surface to user)
        console.warn('[WEBCALL] Stop error (non-Krisp):', errorMessage);
      }
      // Never rethrow - always succeed in stopping UI state
    } finally {
      // Reset flag after a short delay to allow cleanup
      setTimeout(() => {
        isEndingRef.current = false;
      }, 100);
    }
  };

  const handleStart = async () => {

    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setCallState('error');
      setError('Voice agent is not available.');
      return;
    }

    // Wait for Vapi SDK to load if needed
    if (!Vapi) {
      try {
        const module = await import('@vapi-ai/web');
        Vapi = module.default;
      } catch (e) {
        setError('Unable to connect. Please refresh the page.');
        setCallState('error');
        return;
      }
    }

    setCallState('connecting');
    setError(null);
    setShowWarning(false);

    try {
      // Initialize Vapi Web SDK
      // Note: If Vapi SDK supports disabling Krisp via config, add it here:
      // const vapi = new Vapi(publicKey, { disableKrisp: true });
      // For now, we rely on defensive stop() handling
      const vapi = new Vapi(publicKey);

      // Reset ending flag when starting new call
      isEndingRef.current = false;

      // Start call with hardcoded assistant ID
      vapi.start(DEMO_ASSISTANT_ID);

      // Set up event handlers
      vapi.on('call-start', (data: any) => {
        setCallState('live');
        setError(null);

        // Extract real Vapi call ID (e.g., "019bb...") from Vapi event
        // CRITICAL: Only proceed if we have the real Vapi call ID
        const realVapiCallId = data?.call?.id || data?.callId || data?.id || null;
        
        if (!realVapiCallId || typeof realVapiCallId !== 'string' || realVapiCallId.trim() === '') {
          // Skip posting if we don't have the real Vapi call ID
          console.info('[WEBCALL][CLIENT][MISSING_VAPI_CALL_ID]', {
            event: 'call-start',
            data_keys: Object.keys(data || {}),
            call_id: data?.call?.id,
            callId: data?.callId,
            id: data?.id,
          });
          // Still set UI state, but don't send event to backend
          callStartTimeRef.current = Date.now();
          return;
        }

        vapiCallIdRef.current = realVapiCallId;
        
        // Generate our internal UUID for call_id (used across platform/tools)
        const internalCallId = crypto.randomUUID();
        callIdRef.current = internalCallId;
        callStartTimeRef.current = Date.now();

        // Send "started" event to backend
        // Include both call_id (our internal UUID) and vapi_call_id (real Vapi ID)
        // Only POST if we have the real Vapi call ID
        fetch('/api/webcall/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: internalCallId,
            vapi_call_id: realVapiCallId, // Real Vapi call ID (required)
            event: 'started',
            ts: callStartTimeRef.current,
            meta: { channel: 'web' },
          }),
          keepalive: true,
        })
        .then(async (response) => {
          const data = await response.json().catch(() => null);
          
          // Check if backend says END_CALL (rate limited)
          if (data && !data.ok && data.action?.type === 'END_CALL') {
            const reason = data.action?.reason || 'RATE_LIMIT';
            
            // Log the event
            console.info('[WEBCALL][CLIENT][END_CALL]', { reason });
            
            // Immediately end the call (safe, idempotent)
            safeStopCall();
            
            // Disable button for 60 seconds
            setRateLimitCooldown(true);
            if (rateLimitCooldownTimerRef.current) {
              clearTimeout(rateLimitCooldownTimerRef.current);
            }
            rateLimitCooldownTimerRef.current = setTimeout(() => {
              setRateLimitCooldown(false);
              rateLimitCooldownTimerRef.current = null;
            }, 60 * 1000);
            
            // Reset call state
            setCallState('idle');
            setError(null);
            setShowWarning(false);
            if (durationTimerRef.current) {
              clearTimeout(durationTimerRef.current);
              durationTimerRef.current = null;
            }
            if (warningTimerRef.current) {
              clearTimeout(warningTimerRef.current);
              warningTimerRef.current = null;
            }
            if (warningCountdownRef.current) {
              clearInterval(warningCountdownRef.current);
              warningCountdownRef.current = null;
            }
            callIdRef.current = null;
            vapiCallIdRef.current = null;
            callStartTimeRef.current = null;
          }
        })
        .catch((err) => {
          // Silently fail - don't block UI
          console.warn('[WEBCALL] Failed to send started event:', err);
        });

        // Start warning timer (show warning 1 minute before auto-end)
        const warningTime = MAX_CALL_DURATION_MS - WARNING_THRESHOLD_MS;
        warningTimerRef.current = setTimeout(() => {
          setShowWarning(true);
        }, warningTime);

        // Start 5-minute duration timer (auto-end silently)
        durationTimerRef.current = setTimeout(() => {
          safeStopCall();
        }, MAX_CALL_DURATION_MS);
      });

      vapi.on('call-end', (data: any) => {
        // Reset ending flag when call naturally ends
        isEndingRef.current = false;
        
        // CRITICAL: Only POST if we have both call_id and the real Vapi call ID
        // Never send "ended" event without the real Vapi call ID
        if (!callIdRef.current || !callStartTimeRef.current) {
          return;
        }

        // Ensure we have the real Vapi call ID
        const realVapiCallId = vapiCallIdRef.current || data?.call?.id || data?.callId || data?.id || null;
        
        if (!realVapiCallId || typeof realVapiCallId !== 'string' || realVapiCallId.trim() === '') {
          // Skip posting if we don't have the real Vapi call ID
          console.info('[WEBCALL][CLIENT][MISSING_VAPI_CALL_ID]', {
            event: 'call-end',
            call_id: callIdRef.current,
            vapiCallIdRef: vapiCallIdRef.current,
            data_keys: Object.keys(data || {}),
            call_id_from_data: data?.call?.id,
            callId_from_data: data?.callId,
            id_from_data: data?.id,
          });
          return;
        }

        const endTime = Date.now();
        const durationSeconds = Math.round((endTime - callStartTimeRef.current) / 1000);
        
        // Try to extract cost from Vapi call-end event data (if available)
        // Vapi SDK may provide cost in data.cost, data.call?.cost, or similar
        let costUsd: number | undefined = undefined;
        if (data) {
          const rawCost = data?.cost ?? data?.call?.cost ?? data?.summary?.cost;
          if (rawCost !== undefined && rawCost !== null) {
            const parsed = parseFloat(String(rawCost));
            if (Number.isFinite(parsed) && parsed >= 0) {
              costUsd = parsed;
            }
          }
        }
        
        // Only POST if we have the real Vapi call ID
        fetch('/api/webcall/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: callIdRef.current,
            vapi_call_id: realVapiCallId, // Real Vapi call ID (required)
            event: 'ended',
            ts: endTime,
            duration_seconds: durationSeconds,
            ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
          }),
          keepalive: true,
        }).catch((err) => {
          // Silently fail - don't block UI
          console.warn('[WEBCALL] Failed to send ended event:', err);
        });

        setCallState('idle');
        setError(null);
        setShowWarning(false);
        if (durationTimerRef.current) {
          clearTimeout(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        if (warningTimerRef.current) {
          clearTimeout(warningTimerRef.current);
          warningTimerRef.current = null;
        }
        if (warningCountdownRef.current) {
          clearInterval(warningCountdownRef.current);
          warningCountdownRef.current = null;
        }
        // Clean up event listeners and refs
        callIdRef.current = null;
        vapiCallIdRef.current = null;
        callStartTimeRef.current = null;
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
        // Reset ending flag on error
        isEndingRef.current = false;
        
        console.error('Vapi error:', e);
        setError('Connection error. Please try again.');
        setCallState('error');
        setShowWarning(false);
        if (durationTimerRef.current) {
          clearTimeout(durationTimerRef.current);
          durationTimerRef.current = null;
        }
        if (warningTimerRef.current) {
          clearTimeout(warningTimerRef.current);
          warningTimerRef.current = null;
        }
        if (warningCountdownRef.current) {
          clearInterval(warningCountdownRef.current);
          warningCountdownRef.current = null;
        }
        // Clean up on error
        callIdRef.current = null;
        vapiCallIdRef.current = null;
        callStartTimeRef.current = null;
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
      setError('Agent is unavailable. Please try again later.');
      setCallState('error');
    }
  };

  const handleStop = () => {
    // Use safe stop function (idempotent, handles Krisp errors)
    safeStopCall();
    // State will be updated via 'call-end' event listener
    // "ended" event will be sent in call-end handler
  };

  const handleButtonClick = () => {
    if (callState === 'live') {
      handleStop();
    } else if (callState === 'idle') {
      handleStart();
    }
  };

  const isLive = callState === 'live';
  const isDisabled = callState === 'connecting' || rateLimitCooldown;

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        onClick={handleButtonClick}
        disabled={isDisabled}
        size="lg"
        variant="default"
        className="min-w-[180px] bg-black text-white hover:bg-black/90"
      >
        {callState === 'connecting' ? (
          'Connecting...'
        ) : isLive ? (
          'End call'
        ) : (
          'Talk to the agent'
        )}
      </Button>
      
      {/* Minimal supporting text - only shown when idle */}
      {callState === 'idle' && !rateLimitCooldown && (
        <p className="text-sm text-black/60 text-center">
          Ask anything about our services.
        </p>
      )}
      
      {/* Rate limit message - shown when cooldown is active */}
      {rateLimitCooldown && (
        <p className="text-sm text-black/60 text-center">
          Please try again in a few minutes.
        </p>
      )}

      {/* Soft warning - only shown in last 1 minute */}
      {showWarning && isLive && (
        <p className="text-sm text-black/50 text-center animate-in fade-in duration-200">
          This session will end shortly.
        </p>
      )}

      {/* Error message - minimal and calm */}
      {error && callState === 'error' && (
        <p className="text-sm text-black/60 text-center">
          {error}
        </p>
      )}
    </div>
  );
}

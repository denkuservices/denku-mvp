'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, PhoneOff, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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

/**
 * The demo assistant id is fetched from `/api/vapi/start`, never hardcoded here.
 *
 * It used to be a literal in this client component — which both duplicated the constant in
 * `api/vapi/start/route.ts` (whose own comment says it must not reach the client bundle) and
 * made it the one Vapi-account-coupled value with NO environment override. Switching Vapi
 * accounts would leave this button rendering normally and failing silently on every click.
 * Now the server owns it, so `VAPI_AGENT_ID` alone is enough to repoint the demo.
 */
type DemoSession = { assistantId: string; assistantOverrides?: Record<string, unknown> };

/**
 * The server also decides what language the demo answers in.
 *
 * The locale travels with the request because the page knows it and the API route does not: a
 * visitor from Germany is reading `/de`, and a demo that greets them in English under a German
 * page is the product contradicting itself. The overrides come back built from the language
 * registry — the browser never gets to choose a voice or a transcriber.
 */
async function fetchDemoSession(locale: string): Promise<DemoSession | null> {
  try {
    const res = await fetch('/api/vapi/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { assistantId?: unknown; assistantOverrides?: unknown };
    if (typeof data.assistantId !== 'string' || !data.assistantId) return null;
    return {
      assistantId: data.assistantId,
      assistantOverrides:
        data.assistantOverrides && typeof data.assistantOverrides === 'object'
          ? (data.assistantOverrides as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}
const MAX_CALL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD_MS = 60 * 1000; // Show warning in last 1 minute

export type CallState = 'idle' | 'connecting' | 'live' | 'error';

export type DemoCallButtonProps = {
  /**
   * Notified whenever the call state changes. Purely observational — the landing
   * hero uses it to make the Spline employee react when a call connects. It must
   * never influence the state machine below; treat it as a read-only tap.
   */
  onStateChange?: (state: CallState) => void;
};

export function DemoCallButton({ onStateChange }: DemoCallButtonProps = {}) {
  // The language the visitor is reading the page in. Safe here: every consumer of this button
  // lives under the marketing `[locale]` tree, inside NextIntlClientProvider.
  const locale = useLocale();
  // Every visible string on this button comes from the message files. It used to be English
  // hardcoded here, which meant a German visitor read a fully German page with an English call
  // button on it — the one control the page exists to get pressed.
  const t = useTranslations('home.demo');
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

  // Read-only tap for presentation layers (see DemoCallButtonProps.onStateChange).
  // Kept in a ref so a caller passing an inline arrow does not re-fire the effect.
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);
  useEffect(() => {
    onStateChangeRef.current?.(callState);
  }, [callState]);

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
   * ALWAYS transitions UI to idle in finally block, even if stop() throws.
   */
  const safeStopCall = () => {
    // Prevent double teardown
    if (isEndingRef.current) {
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
      // ALWAYS transition to idle state, clear timers, and reset refs
      // This ensures UI never gets stuck, even if SDK events fail
      setCallState('idle');
      setError(null);
      setShowWarning(false);
      
      // Clear all timers
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
      
      // Clear call tracking refs
      callIdRef.current = null;
      vapiCallIdRef.current = null;
      callStartTimeRef.current = null;
      
      // Reset ending flag and clear vapi ref (allow future starts)
      isEndingRef.current = false;
      // Note: We don't set vapiRef.current = null here to allow call-end event to still fire
      // But we ensure UI is already idle, so it won't block
      
      console.info('[WEBCALL][CLIENT][STOP_FINALLY_IDLE]', {
        vapiRefExists: !!vapiRef.current,
      });
    }
  };

  const handleStart = async () => {

    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setCallState('error');
      setError(t('errUnavailable'));
      return;
    }

    // Wait for Vapi SDK to load if needed
    if (!Vapi) {
      try {
        const module = await import('@vapi-ai/web');
        Vapi = module.default;
      } catch (e) {
        setError(t('errRefresh'));
        setCallState('error');
        return;
      }
    }

    setCallState('connecting');
    setError(null);
    setShowWarning(false);

    const session = await fetchDemoSession(locale);
    if (!session) {
      setCallState('error');
      setError(t('errUnavailable'));
      return;
    }

    try {
      // Initialize Vapi Web SDK
      // Note: If Vapi SDK supports disabling Krisp via config, add it here:
      // const vapi = new Vapi(publicKey, { disableKrisp: true });
      // For now, we rely on defensive stop() handling
      const vapi = new Vapi(publicKey);

      // Reset ending flag when starting new call
      isEndingRef.current = false;

      // Start call with the server-provided assistant ID (honours VAPI_AGENT_ID) and the
      // per-call language overrides. Overrides are passed as the second argument so the shared
      // demo assistant — which also answers a real phone number — is never modified.
      vapi.start(session.assistantId, session.assistantOverrides);

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
          // Still ensure UI is idle even if we can't send event
          setCallState('idle');
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
          // Still ensure UI is idle
          setCallState('idle');
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
        setError(t('errConnection'));
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
      setError(t('errAgentDown'));
      setCallState('error');
    }
  };

  const handleStop = () => {
    console.info('[WEBCALL][CLIENT][END_CLICK]', {
      callState,
      isEnding: isEndingRef.current,
    });
    
    // Use safe stop function (idempotent, handles Krisp errors)
    safeStopCall();
    
    // Failsafe: If still not idle after 1500ms, force-reset to idle
    const failsafeTimeout = setTimeout(() => {
      if (callState !== 'idle') {
        console.info('[WEBCALL][CLIENT][FORCE_RESET_IDLE]', {
          previousState: callState,
        });
        
        // Force reset to idle
        setCallState('idle');
        setError(null);
        setShowWarning(false);
        isEndingRef.current = false;
        
        // Clear all timers
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
        
        // Clear call tracking refs
        callIdRef.current = null;
        vapiCallIdRef.current = null;
        callStartTimeRef.current = null;
      }
    }, 1500);
    
    // Clear failsafe if state becomes idle before timeout
    const checkInterval = setInterval(() => {
      if (callState === 'idle') {
        clearTimeout(failsafeTimeout);
        clearInterval(checkInterval);
      }
    }, 100);
    
    // Clean up check interval after failsafe timeout
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 1500);
  };

  const handleButtonClick = () => {
    if (callState === 'live') {
      handleStop();
    } else if (callState === 'idle') {
      handleStart();
    }
  };

  const isLive = callState === 'live';
  // End Call is ALWAYS clickable (never disabled when live)
  // Only "Talk to the agent" button is disabled during connecting or rate limit cooldown
  const isDisabled = !isLive && (callState === 'connecting' || rateLimitCooldown);

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleButtonClick}
        disabled={isDisabled}
        className={[
          'group inline-flex items-center gap-3 rounded-full px-7 py-3.5 text-[15px] font-medium transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60',
          isLive
            ? 'border border-[var(--s-demo-border-live)] bg-[var(--s-demo-bg)] text-[var(--s-demo-fg)] brand-shadow-md hover:-translate-y-0.5 hover:brand-shadow-lg'
            : 'border border-[var(--s-demo-border)] bg-[var(--s-demo-bg)] text-[var(--s-demo-fg)] brand-shadow-md hover:-translate-y-0.5 hover:border-[var(--s-accent)] hover:brand-shadow-lg',
        ].join(' ')}
      >
        <span
          className={[
            'flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors',
            isLive ? 'bg-[var(--s-demo-icon-live)]' : 'bg-[var(--s-demo-icon)] mic-pulse',
          ].join(' ')}
        >
          {callState === 'connecting' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isLive ? (
            <PhoneOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </span>
        {callState === 'connecting' ? t('connectingCta') : isLive ? t('endCall') : t('cta')}
      </button>

      {/* Minimal supporting text - only shown when idle */}
      {callState === 'idle' && !rateLimitCooldown && (
        <p className="font-brand-mono text-xs tracking-wide text-[var(--s-ink-faint)]">
          {t('noSignup')}
        </p>
      )}

      {/* Rate limit message - shown when cooldown is active */}
      {rateLimitCooldown && (
        <p className="font-brand-mono text-xs tracking-wide text-[var(--s-ink-faint)]">
          {t('cooldown')}
        </p>
      )}

      {/* Soft warning - only shown in last 1 minute */}
      {showWarning && isLive && (
        <p className="animate-in fade-in font-brand-mono text-xs tracking-wide text-[var(--s-ink-faint)] duration-200">
          {t('endingSoon')}
        </p>
      )}

      {/* Error message - minimal and calm */}
      {error && callState === 'error' && (
        <p className="font-brand-mono text-xs tracking-wide text-[var(--s-ember)]">
          {error}
        </p>
      )}
    </div>
  );
}

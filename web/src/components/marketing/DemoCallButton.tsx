'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Premium Call Button Component
 * 
 * Features:
 * - Starts Vapi web call with hardcoded assistant ID
 * - 5-minute duration limit (auto-ends silently)
 * - Rate limiting: 4 calls per 1 hour (localStorage)
 * - Minimal UI: no countdown timers, no demo language
 * - Warning shown only in last 1 minute of call
 */

// Dynamic import for Vapi Web SDK to avoid SSR issues
let Vapi: any = null;

const DEMO_ASSISTANT_ID = '155b21ad-2f8b-4593-b33c-c5021e644328';
const MAX_CALL_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD_MS = 60 * 1000; // Show warning in last 1 minute
const RATE_LIMIT_CALLS = 4;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = 'call_history';

type CallState = 'idle' | 'connecting' | 'live' | 'error' | 'rate-limited';

interface CallHistoryEntry {
  timestamp: number;
}

export function DemoCallButton() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningCountdownRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<number | null>(null);

  // Check rate limit on mount
  useEffect(() => {
    if (isRateLimited()) {
      setCallState('rate-limited');
    }
  }, []);

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
      if (vapiRef.current) {
        try {
          vapiRef.current.stop();
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
      callStartTimeRef.current = null;
    };
  }, []);

  function getCallHistory(): CallHistoryEntry[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      const history = JSON.parse(stored) as CallHistoryEntry[];
      // Filter out old entries (older than rate limit window)
      const now = Date.now();
      return history.filter((entry) => now - entry.timestamp < RATE_LIMIT_WINDOW_MS);
    } catch {
      return [];
    }
  }

  function saveCallHistory(history: CallHistoryEntry[]) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore localStorage errors
    }
  }

  function isRateLimited(): boolean {
    const history = getCallHistory();
    return history.length >= RATE_LIMIT_CALLS;
  }

  function recordCall() {
    const history = getCallHistory();
    history.push({ timestamp: Date.now() });
    saveCallHistory(history);
  }

  const handleStart = async () => {
    // Check rate limit (silent enforcement)
    if (isRateLimited()) {
      setCallState('rate-limited');
      // Don't show error message - silently fail
      return;
    }

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
      const vapi = new Vapi(publicKey);

      // Start call with hardcoded assistant ID
      vapi.start(DEMO_ASSISTANT_ID);

      // Set up event handlers
      vapi.on('call-start', (data: any) => {
        setCallState('live');
        setError(null);
        recordCall();

        // Extract or generate call_id from Vapi event
        const vapiCallId = data?.call?.id || data?.callId || data?.id || crypto.randomUUID();
        callIdRef.current = vapiCallId;
        callStartTimeRef.current = Date.now();

        // Send "started" event to backend
        fetch('/api/webcall/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call_id: vapiCallId,
            event: 'started',
            ts: callStartTimeRef.current,
            meta: { channel: 'web' },
          }),
          keepalive: true,
        }).catch((err) => {
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
          if (vapiRef.current) {
            try {
              vapiRef.current.stop();
            } catch (e) {
              // Ignore errors
            }
          }
        }, MAX_CALL_DURATION_MS);
      });

      vapi.on('call-end', () => {
        // Send "ended" event to backend if we have a call_id
        if (callIdRef.current && callStartTimeRef.current) {
          const endTime = Date.now();
          const durationSeconds = Math.round((endTime - callStartTimeRef.current) / 1000);
          
          fetch('/api/webcall/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              call_id: callIdRef.current,
              event: 'ended',
              ts: endTime,
              duration_seconds: durationSeconds,
            }),
            keepalive: true,
          }).catch((err) => {
            // Silently fail - don't block UI
            console.warn('[WEBCALL] Failed to send ended event:', err);
          });
        }

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
    if (vapiRef.current) {
      try {
        vapiRef.current.stop();
        // State will be updated via 'call-end' event listener
        // "ended" event will be sent in call-end handler
      } catch (err: any) {
        console.error('Stop error:', err);
        // Send "ended" event manually if stop fails but we have call_id
        if (callIdRef.current && callStartTimeRef.current) {
          const endTime = Date.now();
          const durationSeconds = Math.round((endTime - callStartTimeRef.current) / 1000);
          
          fetch('/api/webcall/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              call_id: callIdRef.current,
              event: 'ended',
              ts: endTime,
              duration_seconds: durationSeconds,
            }),
            keepalive: true,
          }).catch((fetchErr) => {
            console.warn('[WEBCALL] Failed to send ended event on stop error:', fetchErr);
          });
        }
        
        setError('Unable to end call. Please try again.');
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
        callIdRef.current = null;
        callStartTimeRef.current = null;
        setCallState('idle');
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
      }
    }
  };

  const handleButtonClick = () => {
    if (callState === 'live') {
      handleStop();
    } else if (callState === 'idle') {
      handleStart();
    }
  };

  const isLive = callState === 'live';
  const isDisabled = callState === 'connecting' || callState === 'rate-limited';

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
      {callState === 'idle' && (
        <p className="text-sm text-black/60 text-center">
          Ask anything about our services.
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

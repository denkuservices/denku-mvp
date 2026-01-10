'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

// Dynamic import for Vapi Web SDK to avoid SSR issues
let Vapi: any = null;

// Deterministic waveform heights (no Math.random)
const WAVEFORM_HEIGHTS = [45, 62, 38, 71, 54, 48, 65, 42, 58, 51, 68, 44, 59, 47, 63];

type CallState = 'idle' | 'connecting' | 'connected' | 'error';

export function LiveAgentInline() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const vapiRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        try {
          vapiRef.current.stop();
        } catch (e) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      }
    };
  }, []);

  const handleStart = async () => {
    // Wait for Vapi SDK to load if needed
    if (!Vapi) {
      try {
        const module = await import('@vapi-ai/web');
        Vapi = module.default;
      } catch (e) {
        setError('Failed to load agent SDK. Please refresh the page.');
        return;
      }
    }

    setCallState('connecting');
    setError(null);

    try {
      // Request assistantId from our API (keeps agentId server-side)
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

      // Get public key from env (safe to expose, used for Web SDK auth)
      const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
      if (!publicKey) {
        throw new Error('Vapi public key not configured');
      }

      // Initialize Vapi Web SDK with public key
      const vapi = new Vapi(publicKey);
      
      // Start call with assistantId (returned from our secure API)
      vapi.start(assistantId);

      // Set up event handlers
      vapi.on('call-start', () => {
        setCallState('connected');
      });

      vapi.on('call-end', () => {
        setCallState('idle');
        vapiRef.current = null;
      });

      vapi.on('error', (e: any) => {
        console.error('Vapi error:', e);
        setError('Connection error. Please try again.');
        setCallState('error');
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
        vapiRef.current.stop();
      } catch (e) {
        // Ignore errors
      }
      vapiRef.current = null;
      setCallState('idle');
    }
  };

  const handleToggleMute = () => {
    if (vapiRef.current) {
      try {
        if (isMuted) {
          vapiRef.current.unmute();
        } else {
          vapiRef.current.mute();
        }
        setIsMuted(!isMuted);
      } catch (e) {
        console.error('Mute toggle error:', e);
      }
    }
  };

  const getStatusText = () => {
    switch (callState) {
      case 'idle':
        return 'Ready to talk';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return 'Live conversation';
      case 'error':
        return 'Connection error';
      default:
        return 'Ready';
    }
  };

  const getStatusColor = () => {
    switch (callState) {
      case 'idle':
        return 'bg-gray-400';
      case 'connecting':
        return 'bg-amber-400';
      case 'connected':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <div className="relative rounded-[20px] border border-gray-200 bg-white/90 shadow-shadow-100 p-8 overflow-hidden">
      {/* Waveform decoration behind button */}
      <div className="absolute inset-0 flex items-end justify-center gap-1.5 opacity-5 pointer-events-none z-0 pb-6">
        {WAVEFORM_HEIGHTS.map((height, i) => (
          <div
            key={i}
            className="w-1.5 rounded-t bg-brand-500"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      <div className="relative z-10">
        {/* Status row */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`h-2 w-2 rounded-full ${getStatusColor()} ${callState === 'connected' ? 'animate-pulse' : ''}`} />
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {getStatusText()}
          </span>
        </div>

        {/* Main CTA Button */}
        {callState === 'idle' && (
          <div className="text-center">
            <button
              onClick={handleStart}
              className="group relative inline-flex items-center justify-center rounded-full bg-brand-500 px-14 py-7 text-xl font-bold text-white shadow-lg border-2 border-brand-600/20 transition-all hover:bg-brand-600 hover:shadow-xl hover:-translate-y-1 active:translate-y-0"
            >
              <Mic className="h-6 w-6 mr-3" />
              TALK TO OUR AI
            </button>
            <p className="mt-4 text-sm text-gray-600 font-medium">
              Ask anything. Get an instant answer.
            </p>
            {error && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}
          </div>
        )}

        {callState === 'connecting' && (
          <div className="text-center">
            <div className="inline-flex items-center justify-center rounded-full bg-brand-500 px-12 py-6 text-lg font-bold text-white shadow-lg">
              <Loader2 className="h-5 w-5 mr-3 animate-spin" />
              Connecting...
            </div>
            <p className="mt-4 text-sm text-gray-600">
              Starting your conversation
            </p>
          </div>
        )}

        {callState === 'connected' && (
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center rounded-full bg-green-500 px-12 py-6 text-lg font-bold text-white shadow-lg">
              <div className="h-3 w-3 rounded-full bg-white mr-3 animate-pulse" />
              Live conversation active
            </div>
            <p className="text-sm text-gray-600">
              Speak naturally. The agent will respond to your questions.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={handleToggleMute}
                className="flex items-center gap-2 rounded-full border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 transition-all hover:bg-gray-50 hover:border-gray-300"
              >
                {isMuted ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    Unmute
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Mute
                  </>
                )}
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-2 rounded-full border-2 border-gray-200 bg-white px-4 py-2 text-sm font-bold text-navy-700 transition-all hover:bg-gray-50 hover:border-gray-300"
              >
                End call
              </button>
            </div>
          </div>
        )}

        {callState === 'error' && (
          <div className="text-center">
            <button
              onClick={handleStart}
              className="group relative inline-flex items-center justify-center rounded-full bg-brand-500 px-12 py-6 text-lg font-bold text-white shadow-lg transition-all hover:bg-brand-600 hover:shadow-xl hover:-translate-y-0.5"
            >
              <Mic className="h-5 w-5 mr-3" />
              Try again
            </button>
            <p className="mt-4 text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

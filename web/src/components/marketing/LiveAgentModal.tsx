'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from './Button';

// Dynamic import for Vapi Web SDK to avoid SSR issues
let Vapi: any = null;

type CallState = 'idle' | 'connecting' | 'connected' | 'error';

export function LiveAgentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const vapiRef = useRef<any>(null);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      if (vapiRef.current) {
        try {
          vapiRef.current.stop();
        } catch (e) {
          // Ignore cleanup errors
        }
        vapiRef.current = null;
      }
      setCallState('idle');
      setError(null);
      setIsMuted(false);
    }
  }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[20px] bg-white shadow-3xl border border-gray-200 p-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-6 border-b border-gray-200">
          <DialogTitle className="text-2xl font-bold text-navy-700">
            Talk to Denku AI
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-600 mt-2">
            Ask anything about the platform. This is the real agent.
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 py-6">
          {callState === 'idle' && (
            <div className="text-center py-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 mb-6">
                <Mic className="h-8 w-8 text-brand-500" />
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Click below to start a conversation with our AI agent. You'll be asked for microphone permission.
              </p>
              <Button
                onClick={handleStart}
                size="lg"
                className="bg-brand-500 text-white hover:bg-brand-600"
              >
                Start conversation
              </Button>
            </div>
          )}

          {callState === 'connecting' && (
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 text-brand-500 animate-spin mx-auto mb-4" />
              <p className="text-sm text-gray-600">Connecting to agent...</p>
            </div>
          )}

          {callState === 'connected' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-sm font-bold text-navy-700">Live conversation active</p>
                </div>
                <p className="text-xs text-gray-600 mb-4">
                  Speak naturally. The agent will respond to your questions.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <Button
                    onClick={handleToggleMute}
                    variant="outline"
                    size="sm"
                    className="border-gray-200"
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="h-4 w-4 mr-2" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 mr-2" />
                        Mute
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleStop}
                    variant="outline"
                    size="sm"
                    className="border-gray-200"
                  >
                    End call
                  </Button>
                </div>
              </div>
            </div>
          )}

          {callState === 'error' && (
            <div className="text-center py-12">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 mb-6">
                <X className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-sm font-bold text-navy-700 mb-2">Agent unavailable</p>
              <p className="text-sm text-gray-600 mb-6">{error}</p>
              <Button
                onClick={handleStart}
                size="lg"
                variant="outline"
                className="border-gray-200"
              >
                Try again
              </Button>
            </div>
          )}
        </div>

        <div className="px-8 py-4 border-t border-gray-200 bg-gray-50 rounded-b-[20px]">
          <p className="text-xs text-gray-600 text-center">
            This conversation may be recorded for quality purposes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * useLiveTurn.ts — orchestrator for live "Actually Chat" turns.
 *
 * Phase 8: when a real user message lands in chat mode, we still want
 * the cinematic to play — the dramatization IS the value prop. This
 * hook coordinates:
 *
 *   1. push user msg into chatStore
 *   2. drive arcStore through composing → streaming
 *   3. open a streaming completion via the active provider
 *   4. accumulate response deltas into chatStore
 *   5. transition arc to settled when the provider closes
 *
 * The JSON re-stream + chat bubble sync continues to happen via the
 * existing single-stream architecture (ReReadStage owns the clock,
 * ChatPanel mirrors it). useStreamText was extended to gracefully
 * handle a target text that grows mid-stream (live response).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { useArcStore } from '../store/arcStore';
import {
  getInferenceProvider,
  DEFAULT_LIVE_MODEL,
} from '../services/inferenceProvider';

/** Brief beat after the user msg lands so it can register before JSON kicks in. */
const HOLD_COMPOSING_LIVE = 400;

export function useLiveTurn() {
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const setPhase = useArcStore((s) => s.setPhase);
  const setTurn = useArcStore((s) => s.setTurn);

  const appendUser = useChatStore((s) => s.appendUser);
  const beginAssistant = useChatStore((s) => s.beginAssistant);
  const appendAssistantDelta = useChatStore((s) => s.appendAssistantDelta);
  const finalizeAssistant = useChatStore((s) => s.finalizeAssistant);
  const setStatus = useChatStore((s) => s.setStatus);
  const setError = useChatStore((s) => s.setError);

  const inFlightRef = useRef<{ abort: () => void } | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // 1) Push user msg
      appendUser(trimmed);
      setStatus('streaming-request');

      // 2) Snapshot the messages AFTER the append so the provider sees the user msg
      const messages = useChatStore.getState().messages;

      // Bump turn count to match the live conversation length and enter
      // composing phase (chat shows user msg first; JSON follows).
      const userTurnCount = messages.filter((m) => m.role === 'user').length;
      setTurn(userTurnCount);
      setPhase('composing');

      // 3) Schedule the streaming phase + open the live stream after the
      // composing beat. They're in parallel: the JSON re-stream begins
      // visualizing the request while the network call goes out.
      const provider = getInferenceProvider(inferenceMode);

      window.setTimeout(async () => {
        setPhase('streaming');
        beginAssistant();
        setStatus('streaming-response');

        try {
          const handle = provider.stream(messages, DEFAULT_LIVE_MODEL, userTurnCount);
          inFlightRef.current = { abort: () => provider.abort() };

          for await (const delta of handle.textStream) {
            appendAssistantDelta(delta);
          }

          await handle.fullText; // ensure the stream resolved cleanly
          await handle.metadata; // capture final provider metadata for future UI surfaces
          finalizeAssistant();
          setStatus('done');
          setPhase('settled');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[useLiveTurn] stream failed:', msg);
          setError(msg);
          finalizeAssistant();
          setPhase('settled');
        } finally {
          inFlightRef.current = null;
        }
      }, HOLD_COMPOSING_LIVE);
    },
    [
      inferenceMode,
      appendUser,
      beginAssistant,
      appendAssistantDelta,
      finalizeAssistant,
      setStatus,
      setError,
      setPhase,
      setTurn,
    ],
  );

  return { send };
}

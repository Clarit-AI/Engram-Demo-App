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
import { estimateRequestTokens } from '../lib/agentRequestBundle';

/** Brief beat after the user msg lands so it can register before JSON kicks in. */
const HOLD_COMPOSING_LIVE = 400;

export function useLiveTurn() {
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const setPhase = useArcStore((s) => s.setPhase);
  const setTurn = useArcStore((s) => s.setTurn);
  const setChatPayloadMode = useArcStore((s) => s.setChatPayloadMode);

  const appendUser = useChatStore((s) => s.appendUser);
  const beginAssistant = useChatStore((s) => s.beginAssistant);
  const appendAssistantDelta = useChatStore((s) => s.appendAssistantDelta);
  const finalizeAssistant = useChatStore((s) => s.finalizeAssistant);
  const startRecordingTurn = useChatStore((s) => s.startRecordingTurn);
  const completeRecordingTurn = useChatStore((s) => s.completeRecordingTurn);
  const setProviderMetadata = useChatStore((s) => s.setProviderMetadata);
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
      setProviderMetadata(null);
      appendUser(trimmed);
      setStatus('streaming-request');
      // Lock in the current inference mode for this turn's visualization so
      // that toggling the UI toggle mid-conversation doesn't replay the JSON.
      setChatPayloadMode(inferenceMode);

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
        const startedAt = Date.now();
        const wire = provider.buildWirePayload(messages, DEFAULT_LIVE_MODEL);
        startRecordingTurn({
          id: `turn-${userTurnCount}-${startedAt}`,
          turnNumber: userTurnCount,
          mode: provider.mode,
          providerMode: provider.providerMode,
          model: DEFAULT_LIVE_MODEL,
          startedAt,
          request: {
            body: wire.body,
            messageCount: wire.body.messages.length,
            tokenCount: estimateRequestTokens(JSON.stringify(wire.body)),
            timestamp: startedAt,
          },
          response: null,
          redundantTokens: 0,
          newTokens: estimateRequestTokens(trimmed),
        });

        try {
          const handle = provider.stream(messages, DEFAULT_LIVE_MODEL, userTurnCount);
          inFlightRef.current = { abort: () => provider.abort() };

          for await (const delta of handle.textStream) {
            appendAssistantDelta(delta);
          }

          const fullText = await handle.fullText; // ensure the stream resolved cleanly
          const metadata = await handle.metadata;
          const completedAt = Date.now();
          setProviderMetadata(metadata);
          completeRecordingTurn(userTurnCount, {
            completedAt,
            durationMs: completedAt - startedAt,
            providerMetadata: metadata,
            response: {
              body: fullText,
              tokenCount: estimateRequestTokens(fullText),
              duration: completedAt - startedAt,
            },
          });
          finalizeAssistant();
          setStatus('done');
          setPhase('settled');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[useLiveTurn] stream failed:', msg);
          const completedAt = Date.now();
          completeRecordingTurn(userTurnCount, {
            completedAt,
            durationMs: completedAt - startedAt,
            error: msg,
            response: null,
          });
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
      setChatPayloadMode,
      appendUser,
      beginAssistant,
      appendAssistantDelta,
      finalizeAssistant,
      startRecordingTurn,
      completeRecordingTurn,
      setStatus,
      setError,
      setProviderMetadata,
      setPhase,
      setTurn,
    ],
  );

  return { send };
}

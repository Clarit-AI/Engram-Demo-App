import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useArcStore } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import { useLiveTurn } from '../hooks/useLiveTurn';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { StreamingCursor } from './StreamingCursor';
import { ThinkingDots } from './ThinkingDots';

/**
 * ChatPanel — Clinical Futurist light-side conversation surface.
 *
 * Two modes:
 *   • demo  — pre-recorded turns from activeDemo; mirrors the left
 *             pane's single stream clock (streamedChars +
 *             responseBoundary) so the assistant bubble appears
 *             character-for-character in sync with the JSON.
 *   • chat  — live turns from chatStore; user types into ChatInput,
 *             useLiveTurn drives the JSON re-stream + provider call,
 *             this panel renders messages as they accumulate.
 *
 * Phase display logic (demo mode):
 *   • composing      → user msg visible, no assistant element yet
 *   • streaming (pre-boundary)  → thinking dots under user msg
 *   • streaming (post-boundary) → streaming assistant bubble mirrored
 *   • settled+       → both full
 */
export function ChatPanel() {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const phase = useArcStore((s) => s.phase);
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const streamedChars = useArcStore((s) => s.streamedChars);
  const responseBoundary = useArcStore((s) => s.responseBoundary);

  const liveMessages = useChatStore((s) => s.messages);
  const liveStatus = useChatStore((s) => s.status);
  const liveError = useChatStore((s) => s.errorMessage);
  const liveAssistantBuffer = useChatStore((s) => s.liveAssistantBuffer);

  const { send } = useLiveTurn();

  const isChat = appMode === 'chat';

  // Build canonical pair list for whichever source is active.
  const turnPairs = useMemo(() => {
    const source = isChat
      ? liveMessages.filter((m) => m.role !== 'system')
      : activeDemo
        ? activeDemo.messages.filter((m) => m.role !== 'system')
        : [];
    const pairs: Array<{ user: string; assistant: string }> = [];
    for (let i = 0; i < source.length; i += 2) {
      const u = source[i];
      const a = source[i + 1];
      if (u?.role === 'user') {
        pairs.push({ user: u.content, assistant: a?.role === 'assistant' ? a.content : '' });
      }
    }
    return pairs;
  }, [isChat, liveMessages, activeDemo]);

  const currentPair = currentTurn > 0 ? turnPairs[currentTurn - 1] : undefined;
  const assistantText = isChat
    ? liveAssistantBuffer || currentPair?.assistant || ''
    : currentPair?.assistant ?? '';

  // Show user message from composing onwards.
  const showCurrentUser = ['composing', 'streaming', 'settled', 'peaking', 'revealing', 'post-arc'].includes(phase);

  // Derive the current assistant bubble state from the shared stream clock.
  // Demo mode: streamedChars counts through request + delimiter + response.
  // Chat mode: same shape, but the "response" portion grows live as the
  // provider yields tokens — useStreamText handles the text-extension case.
  const responseCharsStreamed = Math.max(0, streamedChars - responseBoundary);
  const responseVisible = streamedChars > responseBoundary;
  const responseComplete =
    isChat
      ? liveStatus === 'done' && responseCharsStreamed >= assistantText.length
      : assistantText.length > 0 && responseCharsStreamed >= assistantText.length;

  const showThinking = phase === 'streaming' && !responseVisible;
  const showStreamingAssistant = phase === 'streaming' && responseVisible;
  const showFullAssistant =
    phase === 'settled' || phase === 'peaking' || phase === 'revealing' || phase === 'post-arc';

  // Auto-scroll on content change.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [currentTurn, phase, responseCharsStreamed, liveAssistantBuffer.length]);

  const hasAnyContent = isChat ? liveMessages.length > 0 : currentTurn > 0 || showCurrentUser;

  // Input is enabled only in chat mode and when not currently streaming.
  const inputDisabled =
    !isChat ||
    liveStatus === 'streaming-request' ||
    liveStatus === 'streaming-response' ||
    liveStatus === 'awaiting';

  const inputPlaceholder = isChat
    ? liveStatus === 'streaming-response'
      ? 'streaming…'
      : 'Message the model…'
    : 'Chat unlocks after the demo…';

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden micro-grid-corner"
      style={{ background: 'var(--surface)', color: 'var(--on-surface)' }}
    >
      {/* Header */}
      <div className="flex-none px-6 pt-5 pb-3 flex items-center justify-between">
        <span
          className="font-display text-[13px] font-semibold tracking-tight"
          style={{ color: 'var(--on-surface)' }}
        >
          Conversation
        </span>
        {appMode === 'demo' && (
          <span
            className="glass-chip rounded-full px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{
              color: 'var(--primary)',
              background: 'rgba(0, 163, 255, 0.08)',
            }}
          >
            Simulated · {activeDemo?.model.split('/').pop()?.slice(0, 16) ?? 'demo'}
          </span>
        )}
        {isChat && (
          <span
            className="glass-chip rounded-full px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{
              color: inferenceMode === 'stateful' ? 'var(--secondary)' : 'var(--primary)',
              background:
                inferenceMode === 'stateful'
                  ? 'rgba(104,250,221,0.10)'
                  : 'rgba(0,163,255,0.08)',
            }}
          >
            Live · {inferenceMode}
          </span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 clinical-scroll overflow-auto px-6 pb-4">
        {!hasAnyContent ? (
          <div
            className="h-full flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.2em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {isChat ? 'send a message to begin…' : activeDemo ? 'preparing demo…' : 'booting…'}
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            {(() => {
              const nodes: ReactNode[] = [];
              const turnsToShow = Math.min(currentTurn, turnPairs.length);
              for (let i = 0; i < turnsToShow; i++) {
                const pair = turnPairs[i];
                const turnNum = i + 1;
                const isCurrent = turnNum === currentTurn;

                // User message
                const userVisible = !isCurrent || showCurrentUser;
                if (userVisible) {
                  nodes.push(
                    <ChatMessage
                      key={`u-${i}`}
                      role="user"
                      content={pair.user}
                      isNew={isCurrent}
                    />,
                  );
                }

                // Assistant — nested AnimatePresence so the thinking↔bubble
                // swap is a clean exit+enter rather than two overlapping
                // elements in the main list.
                if (!isCurrent) {
                  nodes.push(
                    <ChatMessage
                      key={`a-${i}`}
                      role="assistant"
                      content={pair.assistant}
                    />,
                  );
                } else {
                  nodes.push(
                    <div key={`assistant-slot-${i}`} className="min-h-[40px]">
                      <AnimatePresence mode="wait" initial={false}>
                        {showFullAssistant ? (
                          <ChatMessage
                            key="full"
                            role="assistant"
                            content={assistantText}
                          />
                        ) : showStreamingAssistant ? (
                          <ChatMessage
                            key="streaming"
                            role="assistant"
                            content={assistantText.slice(0, responseCharsStreamed)}
                            isNew
                            trailingCursor={
                              !responseComplete ? <StreamingCursor /> : null
                            }
                          />
                        ) : showThinking ? (
                          <ThinkingDots key="thinking" />
                        ) : null}
                      </AnimatePresence>
                    </div>,
                  );
                }
              }
              return nodes;
            })()}

            {/* Live error surface */}
            {isChat && liveError && (
              <div
                className="rounded-lg px-3 py-2 text-[12px] font-mono"
                style={{
                  background: 'var(--error-container, #ffdad6)',
                  color: 'var(--on-error-container, #410002)',
                }}
                role="alert"
              >
                {liveError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input — wired to useLiveTurn in chat mode */}
      <div className="flex-none px-6 pb-5 pt-2">
        <ChatInput
          disabled={inputDisabled}
          placeholder={inputPlaceholder}
          onSend={isChat ? send : undefined}
        />
      </div>
    </div>
  );
}

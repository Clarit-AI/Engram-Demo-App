import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import { useLiveTurn } from '../hooks/useLiveTurn';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
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
export function ChatPanel({ mobile = false }: { mobile?: boolean }) {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const phase = useArcStore((s) => s.phase);
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const streamedChars = useArcStore((s) => s.streamedChars);
  const responseBoundary = useArcStore((s) => s.responseBoundary);
  const setInferenceMode = useArcStore((s) => s.setInferenceMode);

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

  // The agent pane owns the response stream first. The user-facing pane
  // keeps showing typing dots until that hidden-side response is complete.
  const responseCharsStreamed = Math.max(0, streamedChars - responseBoundary);

  const showThinking = phase === 'streaming';
  const showStreamingAssistant = phase === 'streaming' && responseCharsStreamed > 0;
  const showFullAssistant =
    phase === 'settled' || phase === 'peaking' || phase === 'revealing' || phase === 'post-arc';

  const demoInputText = !isChat && phase === 'composing' && currentPair
    ? currentPair.user.slice(0, streamedChars)
    : undefined;

  // Auto-scroll on content change.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [currentTurn, phase, responseCharsStreamed, liveAssistantBuffer.length]);

  const hasAnyContent = isChat ? liveMessages.length > 0 : currentTurn > 1 || showCurrentUser || !!demoInputText;

  // Input is enabled only in chat mode and when not currently streaming.
  const inputDisabled =
    !isChat ||
    phase === 'streaming' ||
    liveStatus === 'streaming-request' ||
    liveStatus === 'streaming-response' ||
    liveStatus === 'awaiting';

  const inputPlaceholder = isChat
    ? (liveStatus === 'streaming-response' || phase === 'streaming')
      ? 'streaming…'
      : 'Message the model…'
    : 'Chat unlocks after the simulation…';
  const modeSurfaceKey = isChat ? 'chat-live' : 'replay-demo';
  const crossfadeTransition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden micro-grid-corner"
      style={{ background: 'var(--surface)', color: 'var(--on-surface)' }}
    >
      <div className={mobile ? 'flex-none px-4 pt-3 pb-2' : 'flex-none px-6 pt-4 pb-3'}>
        <div
          className={
            mobile
              ? 'glass-chip flex flex-col gap-2 rounded-2xl px-3 py-3 ambient-shadow'
              : 'glass-chip flex flex-col gap-2 rounded-2xl px-4 py-3 ambient-shadow xl:flex-row xl:items-center xl:justify-between xl:gap-3'
          }
        >
          <div className="min-w-0 shrink-0 flex items-center gap-2.5">
            <div
              className="font-display text-[15px] font-bold tracking-tight"
              style={{ color: 'var(--on-surface)' }}
            >
              What Humans See
            </div>
          </div>

          <div className="flex shrink-0 items-center">
            <div
              className="flex items-center gap-0.5 rounded-3xl p-0.5"
              role="radiogroup"
              aria-label="Inference mode"
              style={{
                background: 'rgba(25,28,30,0.06)',
                border: '1px solid rgba(25,28,30,0.12)',
              }}
            >
              {(['stateless', 'stateful'] as const).map((mode) => {
                const active = inferenceMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setInferenceMode(mode)}
                    className="relative rounded-[20px] px-3.5 py-[7px] font-mono text-[8px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: active ? 'white' : '#8692A6', transition: 'color 0.2s ease' }}
                  >
                    {active && (
                      <motion.span
                        layoutId="inference-toggle-pill"
                        className="absolute inset-0 rounded-[20px]"
                        style={{ background: '#00A1FF', boxShadow: '0 1px 4px rgba(0,161,255,0.25)' }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative">{mode}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className={mobile ? 'flex-1 clinical-scroll overflow-auto px-4 pb-3' : 'flex-1 clinical-scroll overflow-auto px-6 pb-4'}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={modeSurfaceKey}
            className="min-h-full"
            initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(3px)' }}
            transition={crossfadeTransition}
          >
            {!hasAnyContent ? (
              <div
                className="h-full flex items-center justify-center text-[11px] font-mono uppercase tracking-[0.2em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {isChat || activeDemo ? 'send a message to begin…' : 'awaiting input'}
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-2">
                {(() => {
                  const nodes: ReactNode[] = [];
                  const turnsToShow = isChat
                    ? turnPairs.length
                    : Math.min(currentTurn, turnPairs.length);
                  for (let i = 0; i < turnsToShow; i++) {
                    const pair = turnPairs[i];
                    const turnNum = i + 1;
                    const isCurrent = turnNum === currentTurn;

                    // User message
                    const userVisible = !isCurrent || (showCurrentUser && phase !== 'composing');
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Input — wired to useLiveTurn in chat mode */}
      <div className={mobile ? 'flex-none px-4 pb-4 pt-2' : 'flex-none px-6 pb-5 pt-2'}>
        <ChatInput
          disabled={inputDisabled}
          placeholder={inputPlaceholder}
          onSend={isChat ? send : undefined}
          displayText={demoInputText}
          sending={!isChat && phase === 'streaming' && responseCharsStreamed === 0}
        />
      </div>
    </div>
  );
}


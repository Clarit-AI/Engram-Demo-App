import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import { useLiveTurn } from '../hooks/useLiveTurn';
import { DEFAULT_LIVE_MODEL } from '../services/inferenceProvider';
import { capDemoToTurns, loadDemo } from '../services/demoLibrary';
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
  const catalog = useArcStore((s) => s.catalog);
  const activeDemoKey = useArcStore((s) => s.activeDemoKey);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const setActiveDemo = useArcStore((s) => s.setActiveDemo);
  const setAppMode = useArcStore((s) => s.setAppMode);

  const liveMessages = useChatStore((s) => s.messages);
  const liveStatus = useChatStore((s) => s.status);
  const liveError = useChatStore((s) => s.errorMessage);
  const liveAssistantBuffer = useChatStore((s) => s.liveAssistantBuffer);
  const liveMetadata = useChatStore((s) => s.lastMetadata);

  const { send } = useLiveTurn();
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isChat = appMode === 'chat';
  const selectedDemo = catalog.find((demo) => demo.key === activeDemoKey);

  useEffect(() => {
    if (!demoMenuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDemoMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [demoMenuOpen]);

  const handleSelectDemo = async (key: string) => {
    if (key === activeDemoKey) {
      setDemoMenuOpen(false);
      return;
    }

    setLoadingKey(key);
    const demo = await loadDemo(key);
    setLoadingKey(null);
    setDemoMenuOpen(false);
    if (!demo) return;

    const capped = capDemoToTurns(demo.messages, turnsCap);
    setAppMode('demo');
    setActiveDemo(key, {
      ...demo,
      messages: capped,
      turnCount: capped.filter((message) => message.role === 'user').length,
    });
  };

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

          <div
            className={
              mobile
                ? 'no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5'
                : 'no-scrollbar flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 xl:w-auto xl:justify-end xl:overflow-visible xl:pb-0'
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              {appMode === 'demo' ? (
                <motion.div
                  key="demo-controls"
                  className="relative min-w-0 shrink-0"
                  ref={menuRef}
                  initial={{ opacity: 0, y: -3, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: 3, filter: 'blur(3px)' }}
                  transition={crossfadeTransition}
                >
                  <button
                    type="button"
                    onClick={() => setDemoMenuOpen((value) => !value)}
                    className="flex min-h-9 max-w-[220px] items-center gap-1.5 rounded-full px-3 font-mono text-[9px] font-bold uppercase tracking-[0.16em] shadow-[0_8px_18px_-14px_rgba(0,98,157,0.75)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: 'var(--primary)',
                      border: '1px solid rgba(0,98,157,0.24)',
                      color: '#FFFFFF',
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={demoMenuOpen}
                    title={selectedDemo?.title}
                  >
                    <span className="truncate">Choose conversation</span>
                    <span className="text-[8px] opacity-75" aria-hidden>
                      v
                    </span>
                  </button>

                  <AnimatePresence>
                    {demoMenuOpen && (
                      <motion.ul
                        role="listbox"
                        className="absolute right-0 top-full z-50 mt-2 min-w-[260px] max-w-[calc(100vw-2rem)] rounded-2xl bg-surface-container-lowest py-2 ambient-shadow"
                        style={{ border: '1px solid rgba(25,28,30,0.10)' }}
                        initial={{ y: -4, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -4, opacity: 0, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      >
                        {catalog.map((demo) => {
                          const active = demo.key === activeDemoKey;
                          const loading = loadingKey === demo.key;
                          return (
                            <li key={demo.key} role="option" aria-selected={active}>
                              <button
                                type="button"
                                onClick={() => handleSelectDemo(demo.key)}
                                disabled={loading}
                                className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-black/[0.035] disabled:opacity-50"
                              >
                                <span className="min-w-0">
                                  <span
                                    className="block truncate font-mono text-[11px]"
                                    style={{ color: active ? 'var(--primary)' : 'var(--on-surface)' }}
                                    title={demo.title}
                                  >
                                    {demo.title}
                                  </span>
                                  <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                                    {demo.turnCount} turns - {demo.model.split('/').pop()}
                                  </span>
                                </span>
                                <span className="font-mono text-[10px] text-primary">
                                  {loading ? '...' : active ? '*' : ''}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div
                  key="live-controls"
                  initial={{ opacity: 0, y: -3, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: 3, filter: 'blur(3px)' }}
                  transition={crossfadeTransition}
                >
                  <LiveProviderChips inferenceMode={inferenceMode} metadata={liveMetadata} />
                </motion.div>
              )}
            </AnimatePresence>
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

function LiveProviderChips({
  inferenceMode,
  metadata,
}: {
  inferenceMode: 'stateless' | 'stateful';
  metadata: ReturnType<typeof useChatStore.getState>['lastMetadata'];
}) {
  const providerMode = metadata?.providerMode;
  const statelessProvider = metadata?.statelessProvider;
  const configuredStatelessProvider = import.meta.env.VITE_STATELESS_PROVIDER as 'nvidia-nim' | 'openrouter' | '' | undefined;
  const configuredStatefulMode = import.meta.env.VITE_STATEFUL_PROVIDER_MODE;
  const liveModel = (metadata?.model || DEFAULT_LIVE_MODEL).toLowerCase();
  const inferredStatelessProvider = liveModel.includes('nvidia/') || liveModel.includes('nemotron')
    ? 'nvidia-nim'
    : 'openrouter';
  const effectiveStatelessProvider = statelessProvider ?? configuredStatelessProvider ?? inferredStatelessProvider;
  // Before the first message, metadata is absent — fall back to the configured stateful mode
  // so the chip reflects the intended provider rather than defaulting to "Simulated".
  const isEngram = providerMode === 'stateful-engram' ||
    (!providerMode && inferenceMode === 'stateful' && configuredStatefulMode === 'stateful-engram');
  const providerLabel = isEngram
    ? 'Engram'
    : effectiveStatelessProvider === 'nvidia-nim'
      ? 'NVIDIA NIM'
      : effectiveStatelessProvider === 'openrouter'
        ? 'OpenRouter'
        : providerMode === 'stateless-openrouter'
          ? 'OpenRouter'
          : inferenceMode === 'stateful'
            ? 'Alternate provider'
            : 'Provider pending';
  // "Simulated" badge only appears in simulated-engram mode (stateless provider pretending to be Engram).
  // Pure stateless NIM/OpenRouter is not simulated — it's genuinely stateless.
  const isSimulated = providerMode === 'simulated-engram' ||
    (!providerMode && inferenceMode === 'stateful' && configuredStatefulMode !== 'stateful-engram');

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className="glass-chip min-h-9 rounded-full px-3.5 text-[9px] font-mono font-bold uppercase tracking-[0.18em] flex items-center"
        title={`Current provider: ${providerLabel}`}
        style={{
          color: isEngram ? 'var(--secondary)' : 'var(--primary)',
          background: isEngram ? 'rgba(104,250,221,0.10)' : 'rgba(0,163,255,0.08)',
          border: isEngram ? '1px solid rgba(104,250,221,0.20)' : '1px solid rgba(0,163,255,0.18)',
        }}
      >
        <span className="mr-1.5 opacity-70">Current provider.</span>
        <span>{providerLabel}</span>
      </span>

      {isSimulated && (
        <span
          className="hidden min-h-9 items-center rounded-full px-3 text-[9px] font-mono font-bold uppercase tracking-[0.16em] shadow-[0_8px_18px_-14px_rgba(0,191,165,0.85)] sm:inline-flex"
          title="The Engram backend is currently offline. Currently using an alternate provider."
          style={{
            color: '#005C4F',
            background: 'rgba(104,250,221,0.20)',
            border: '1.5px solid rgba(0,191,165,0.36)',
          }}
        >
          Simulated
        </span>
      )}
    </div>
  );
}

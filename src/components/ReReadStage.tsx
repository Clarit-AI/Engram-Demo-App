import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArcStore, type ArcPhase } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import {
  loadCatalog,
  loadDemo,
  capDemoToTurns,
  DEFAULT_DEMO_KEY,
} from '../services/demoLibrary';
import {
  buildStatelessPayload,
  stringifyPayload,
  composeTurnStreamText,
  buildCompactPacketText,
  makeContextId,
} from '../lib/buildPayload';
import {
  getInferenceProvider,
  stringifyWirePayload,
  DEFAULT_LIVE_MODEL,
} from '../services/inferenceProvider';
import { AgentInboxStage, type AgentInboxResponse } from './AgentInboxStage';
import { ReReadHUD } from './ReReadHUD';
import { TimelineStrip } from './TimelineStrip';
import { useStreamText, commonPrefixLength } from '../hooks/useStreamText';
import {
  buildStatefulAgentRequestBundle,
  buildStatelessAgentRequestBundle,
} from '../lib/agentRequestBundle';
import type { AppMode, InferenceMode } from '../store/arcStore';

/**
 * Streaming pacing configuration.
 *
 * Rates chosen to deliver the plan's target arc duration (~45–55 s
 * perceived). Fast rate flies through "recall" content so the audience
 * doesn't re-read word-for-word; slow rate forces the new content to
 * land as a fresh event.
 */
const FAST_RATE_CPS = 600;  // recall speed (chars/sec) — the model is "fast-forwarding" through seen content
const SLOW_RATE_CPS = 140;  // new-content speed — dramatic-slow but not audience-losing slow
const HUMAN_TYPE_CPS = 42;

/** Phase hold times between beats (ms) */
const HOLD_INTRO = 700;
const HOLD_COMPOSING = 650;  // user msg sits on chat pane before JSON starts re-reading it
const HOLD_SETTLED = 450;    // brief beat after the full stream (request + response) completes
const HOLD_PEAKING = 1500;

export function ReReadStage({ mobile = false }: { mobile?: boolean }) {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const totalTurns = useArcStore((s) => s.totalTurns);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const phase = useArcStore((s) => s.phase);
  const revealStep = useArcStore((s) => s.revealStep);
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const debugHoldStateless = useArcStore((s) => s.debugHoldStateless);
  const engramAvailable = useArcStore((s) => s.engramAvailable);
  const liveMessages = useChatStore((s) => s.messages);
  const liveAssistantBuffer = useChatStore((s) => s.liveAssistantBuffer);
  // The inference mode locked at turn-send time — stable across UI toggles.
  const chatPayloadMode = useArcStore((s) => s.chatPayloadMode);

  const setCatalog = useArcStore((s) => s.setCatalog);
  const setActiveDemo = useArcStore((s) => s.setActiveDemo);
  const setAppMode = useArcStore((s) => s.setAppMode);
  const setPhase = useArcStore((s) => s.setPhase);
  const setTurn = useArcStore((s) => s.setTurn);
  const setStreamProgress = useArcStore((s) => s.setStreamProgress);
  const setResponseBoundary = useArcStore((s) => s.setResponseBoundary);

  // ---- Boot catalog once ----
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current || activeDemo) return;
    booted.current = true;
    (async () => {
      const [catalogResult, defaultDemo] = await Promise.all([
        loadCatalog(),
        loadDemo(DEFAULT_DEMO_KEY),
      ]);
      setCatalog(catalogResult);
      setAppMode('demo');
      if (defaultDemo) {
        const capped = capDemoToTurns(defaultDemo.messages, turnsCap);
        setActiveDemo(DEFAULT_DEMO_KEY, {
          ...defaultDemo,
          messages: capped,
          turnCount: capped.filter((m) => m.role === 'user').length,
        });
      }
    })();
  }, [activeDemo, setCatalog, setActiveDemo, setAppMode, turnsCap]);

  // ---- Stream text for the CURRENT turn = request + delimiter + response ----
  // Demo mode: pre-recorded conversation drives both halves.
  // Chat mode: live conversation history drives the request half; the
  //            response half grows as the model emits tokens.
  const { payloadText, responseBoundary } = useMemo(() => {
    if (appMode === 'chat') {
      if (currentTurn < 1 || liveMessages.length === 0) {
        return { payloadText: '', responseBoundary: Number.MAX_SAFE_INTEGER };
      }
      // History excluding the in-flight assistant placeholder (which is
      // displayed via the response half, not in the request body).
      const inFlight =
        liveMessages[liveMessages.length - 1]?.role === 'assistant' &&
        phase === 'streaming';
      const requestMessages = inFlight
        ? liveMessages.slice(0, -1)
        : liveMessages;

      // Use the snapshotted mode (locked at send time) so that toggling
      // stateless/stateful in the UI doesn't change payloadText mid-turn
      // and trigger a useStreamText reset/replay.
      const provider = getInferenceProvider(chatPayloadMode);
      const wire = provider.buildWirePayload(requestMessages, DEFAULT_LIVE_MODEL);
      const requestText = stringifyWirePayload(wire);
      const responseContent = liveAssistantBuffer;
      const { fullText, responseBoundary: boundary } = composeTurnStreamText(
        requestText,
        responseContent,
      );
      return { payloadText: fullText, responseBoundary: boundary };
    }

    // Demo mode
    if (!activeDemo || currentTurn < 1) {
      return { payloadText: '', responseBoundary: Number.MAX_SAFE_INTEGER };
    }
    const clamp = Math.min(currentTurn, activeDemo.turnCount);
    const request = buildStatelessPayload(activeDemo.messages, activeDemo.model, clamp);
    const requestText = stringifyPayload(request);

    // Assistant response for this turn (for the stream's response section)
    const convo = activeDemo.messages.filter((m) => m.role !== 'system');
    const responseContent = convo[2 * clamp - 1]?.content ?? '';

    const { fullText, responseBoundary: boundary } = composeTurnStreamText(requestText, responseContent);
    return { payloadText: fullText, responseBoundary: boundary };
  }, [appMode, activeDemo, currentTurn, liveMessages, liveAssistantBuffer, phase, chatPayloadMode]);

  /** Prior turn full stream text — used to compute recall divergence */
  const priorPayloadText = useMemo(() => {
    if (currentTurn < 2) return '';
    if (appMode === 'chat') {
      // Build the prior turn's wire payload from chatStore history. Use the
      // snapshotted mode for the same reason as payloadText — we don't want
      // a UI toggle to change the recall prefix and cause a stream restart.
      const userIdxs: number[] = [];
      liveMessages.forEach((m, i) => { if (m.role === 'user') userIdxs.push(i); });
      const priorUserIdx = userIdxs[currentTurn - 2];
      if (priorUserIdx === undefined) return '';
      const priorMessages = liveMessages.slice(0, priorUserIdx + 1);
      const provider = getInferenceProvider(chatPayloadMode);
      const wire = provider.buildWirePayload(priorMessages, DEFAULT_LIVE_MODEL);
      const requestText = stringifyWirePayload(wire);
      // Prior turn's assistant text (already in store)
      const priorAssistant = liveMessages[priorUserIdx + 1];
      const responseContent =
        priorAssistant?.role === 'assistant' ? priorAssistant.content : '';
      const { fullText } = composeTurnStreamText(requestText, responseContent);
      return fullText;
    }
    if (!activeDemo) return '';
    const prior = Math.min(currentTurn - 1, activeDemo.turnCount);
    const request = buildStatelessPayload(activeDemo.messages, activeDemo.model, prior);
    const requestText = stringifyPayload(request);
    const convo = activeDemo.messages.filter((m) => m.role !== 'system');
    const responseContent = convo[2 * prior - 1]?.content ?? '';
    const { fullText } = composeTurnStreamText(requestText, responseContent);
    return fullText;
  }, [activeDemo, currentTurn, appMode, liveMessages, chatPayloadMode]);

  const newContentStart = useMemo(() => {
    if (!priorPayloadText) return 0; // turn 1 → everything is new
    return commonPrefixLength(priorPayloadText, payloadText);
  }, [priorPayloadText, payloadText]);

  const currentUserText = useMemo(() => {
    if (currentTurn < 1) return '';
    const sourceMessages = appMode === 'chat'
      ? liveMessages
      : activeDemo?.messages ?? [];
    const userTurns = sourceMessages.filter((message) => message.role === 'user');
    return userTurns[Math.max(0, currentTurn - 1)]?.content ?? '';
  }, [activeDemo, appMode, currentTurn, liveMessages]);

  // Publish response boundary to store so ChatPanel knows when to flip
  // thinking-dots → streaming bubble for the current turn.
  useEffect(() => {
    setResponseBoundary(responseBoundary);
  }, [responseBoundary, setResponseBoundary]);

  // ---- Streaming state ----
  const streamPlaying = phase === 'streaming';

  const handleStreamComplete = useCallback(() => {
    // Demo mode: full stream (request + response) done — go to 'settled';
    // the orchestrator handles the beat + turn advance.
    // Chat mode: useLiveTurn owns the settled transition (it knows when
    // the network stream actually closed). The JSON stream may finish
    // before the network response, in which case we just hold position.
    if (appMode === 'demo') setPhase('settled');
  }, [appMode, setPhase]);

  const { streamedChars } = useStreamText({
    text: payloadText,
    newContentStart,
    fastRate: FAST_RATE_CPS,
    slowRate: SLOW_RATE_CPS,
    playing: streamPlaying,
    onComplete: handleStreamComplete,
  });

  const { streamedChars: composedChars, isComplete: composingComplete } = useStreamText({
    text: currentUserText,
    newContentStart: 0,
    fastRate: HUMAN_TYPE_CPS,
    slowRate: HUMAN_TYPE_CPS,
    playing: appMode === 'demo' && phase === 'composing',
  });

  // Mirror streamedChars into the store so ChatPanel can sync its
  // thinking-dots → bubble swap + bubble content to the same clock.
  useEffect(() => {
    setStreamProgress(phase === 'composing' ? composedChars : streamedChars);
  }, [composedChars, phase, setStreamProgress, streamedChars]);

  // ---- Arc orchestrator — phase transition effects ----
  // ONLY runs in demo mode. Live chat mode drives its own phase
  // transitions through useLiveTurn.
  useEffect(() => {
    if (!activeDemo) return;
    if (appMode !== 'demo') return;

    const scheduleNext = (nextPhase: ArcPhase, delay: number) =>
      window.setTimeout(() => setPhase(nextPhase), delay);

    let timer: number | undefined;

    switch (phase) {
      case 'intro':
        // First-turn kickoff: user message appears in chat pane BEFORE
        // the JSON starts "reading" it on the left (realistic ordering).
        window.setTimeout(() => setTurn(1), HOLD_INTRO - 10);
        timer = scheduleNext('composing', HOLD_INTRO);
        break;

      case 'composing':
        // User msg is now visible in chat pane. Hold briefly so the
        // viewer registers it, then the server starts reading the payload.
        if (composingComplete) {
          timer = scheduleNext('streaming', HOLD_COMPOSING);
        }
        break;

      case 'streaming':
        // useStreamText drives this; its onComplete transitions to 'settled'.
        break;

      case 'settled': {
        const atCap = currentTurn >= totalTurns;
        timer = window.setTimeout(() => {
          if (atCap) {
            setPhase('peaking');
          } else {
            // Advance turn AND re-enter 'composing' so the NEXT user msg
            // appears in chat before the JSON starts re-reading it.
            setTurn(currentTurn + 1);
            setPhase('composing');
          }
        }, HOLD_SETTLED);
        break;
      }

      case 'peaking':
        if (!debugHoldStateless) {
          timer = scheduleNext('revealing', HOLD_PEAKING);
        }
        break;

      default:
        break;
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    phase,
    currentTurn,
    totalTurns,
    activeDemo,
    appMode,
    setPhase,
    setTurn,
    composingComplete,
    debugHoldStateless,
  ]);

  // ---- Context Engine scan progress ----
  // The request body is the required prefill work. The response section still
  // drives chat sync, but the left pane's traversal completes at the boundary.
  const requestChars = Math.max(1, responseBoundary);
  const responseCharsStreamed = Math.max(0, streamedChars - responseBoundary);
  const scanProgress =
    phase === 'streaming'
      ? Math.min(streamedChars, responseBoundary) / requestChars
      : phase === 'settled' ||
          phase === 'peaking' ||
          phase === 'revealing' ||
          phase === 'post-arc'
        ? 1
        : 0;

  const inboxResponses = useMemo<AgentInboxResponse[]>(() => {
    if (currentTurn < 1) return [];

    const responseVisible =
      phase === 'settled' ||
      phase === 'peaking' ||
      phase === 'revealing' ||
      phase === 'post-arc';

    if (appMode === 'chat') {
      const source = liveMessages.filter((message) => message.role !== 'system');
      const responses: AgentInboxResponse[] = [];
      for (let index = 0; index < currentTurn; index += 1) {
        const turn = index + 1;
        const assistant = source[index * 2 + 1];
        const isCurrent = turn === currentTurn;
        const content = isCurrent
          ? liveAssistantBuffer || (assistant?.role === 'assistant' ? assistant.content : '')
          : assistant?.role === 'assistant'
            ? assistant.content
            : '';
        const visibleChars = isCurrent && phase === 'streaming'
          ? Math.min(responseCharsStreamed, content.length)
          : isCurrent && !responseVisible
            ? 0
            : content.length;
        if (content) {
          responses.push({
            turn,
            content,
            visibleChars,
            streaming: isCurrent && phase === 'streaming' && visibleChars < content.length,
          });
        }
      }
      return responses;
    }

    if (!activeDemo) return [];
    const convo = activeDemo.messages.filter((message) => message.role !== 'system');
    const clamp = Math.min(currentTurn, activeDemo.turnCount);
    return Array.from({ length: clamp }, (_, index) => {
      const turn = index + 1;
      const assistant = convo[index * 2 + 1];
      const content = assistant?.role === 'assistant' ? assistant.content : '';
      const isCurrent = turn === clamp;
      const visibleChars = isCurrent && phase === 'streaming'
        ? Math.min(responseCharsStreamed, content.length)
        : isCurrent && !responseVisible
          ? 0
          : content.length;
      return {
        turn,
        content,
        visibleChars,
        streaming: isCurrent && phase === 'streaming' && visibleChars < content.length,
      };
    }).filter((response) => response.content.length > 0);
  }, [
    activeDemo,
    appMode,
    currentTurn,
    liveAssistantBuffer,
    liveMessages,
    phase,
    responseCharsStreamed,
  ]);

  // ---- Stateful reveal: compact packet text for the punchline ----
  const compactPacketText = useMemo(() => {
    const sourceMessages = activeDemo?.messages ?? liveMessages;
    if (sourceMessages.length === 0) return '';
    const convo = sourceMessages.filter((m) => m.role !== 'system');
    const userTurns = convo.filter((m) => m.role === 'user');
    const lastUser = userTurns[userTurns.length - 1]?.content ?? '';
    const ctxId = makeContextId(
      activeDemo ? `${activeDemo.key}:${activeDemo.title}` : `live:${DEFAULT_LIVE_MODEL}`,
    );
    return buildCompactPacketText(lastUser, ctxId);
  }, [activeDemo, liveMessages]);

  // Stream the compact packet only during 'compact-streaming' step
  const compactPlaying =
    phase === 'revealing' && revealStep === 'compact-streaming';
  const { streamedChars: compactStreamed } = useStreamText({
    text: compactPacketText,
    newContentStart: 0,         // entire compact packet is "new" — full slow rate
    fastRate: 220,
    slowRate: 220,              // crisp + fast since this IS the relief
    playing: compactPlaying,
  });
  const revealCompactActive =
    phase === 'revealing' &&
    (revealStep === 'compact-streaming' ||
      revealStep === 'badge' ||
      revealStep === 'finalized');

  const compactProgress = compactPlaying && compactPacketText
    ? compactStreamed / compactPacketText.length
    : 1;

  // Decide which content the JSON column shows:
  //   - normal stream during streaming/settled/peaking
  //   - compact packet when stateful is selected, plus the reveal beat
  const showingCompact = inferenceMode === 'stateful' || revealCompactActive;

  const inboxModel = useMemo(() => {
    if (currentTurn < 1) return { bundles: [] };

    const contextId = makeContextId(
      activeDemo ? `${activeDemo.key}:${activeDemo.title}` : `live:${DEFAULT_LIVE_MODEL}`,
    );

    if (appMode === 'chat') {
      const inFlight =
        liveMessages[liveMessages.length - 1]?.role === 'assistant' &&
        phase === 'streaming';
      const requestMessages = inFlight
        ? liveMessages.slice(0, -1)
        : liveMessages;

      const bundles = Array.from({ length: currentTurn }, (_, i) =>
        showingCompact
          ? buildStatefulAgentRequestBundle(requestMessages, i + 1, contextId)
          : buildStatelessAgentRequestBundle(requestMessages, i + 1),
      );

      return { bundles };
    }

    if (!activeDemo) return { bundles: [] };
    const clamp = Math.min(currentTurn, activeDemo.turnCount);
    const bundles = Array.from({ length: clamp }, (_, i) =>
      showingCompact
        ? buildStatefulAgentRequestBundle(activeDemo.messages, i + 1, contextId)
        : buildStatelessAgentRequestBundle(activeDemo.messages, i + 1),
    );

    return { bundles };
  }, [activeDemo, appMode, currentTurn, liveMessages, phase, showingCompact]);

  // Vacuum-collapse animation for the JSON column.
  const isCollapsing =
    phase === 'revealing' &&
    (revealStep === 'collapsing' ||
      revealStep === 'sweep' ||
      revealStep === 'chroma');

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden micro-grid-corner"
      style={{ background: 'var(--surface-dark)', color: 'var(--on-surface-dark)' }}
    >
      <ReReadHUD mobile={mobile} />

      {/* Stateless agent inbox - visible during the demo arc; vacuums up on reveal */}
      {!showingCompact && (
        <motion.div
          className={mobile ? 'flex-1 overflow-hidden px-3 pb-12 pt-20' : 'flex-1 overflow-hidden px-8 pt-28 pb-16'}
          initial={false}
          animate={
            isCollapsing
              ? {
                  scale: 0.05,
                  x: -240,
                  y: -180,
                  opacity: 0,
                  filter: 'blur(4px)',
                }
              : {
                  scale: 1,
                  x: 0,
                  y: 0,
                  opacity: 1,
                  filter: 'blur(0px)',
                }
          }
          transition={
            isCollapsing
              ? { duration: 0.85, ease: [0.55, 0, 0.78, 0] }
              : { type: 'spring', stiffness: 140, damping: 22, mass: 1.1 }
          }
          style={{ transformOrigin: 'top left' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`agent-${appMode}`}
              className="h-full"
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <AgentInboxStage
                bundles={inboxModel.bundles}
                responses={inboxResponses}
                readProgress={scanProgress}
                humanTyping={phase === 'composing'}
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}

      {/* Compact agent inbox packet - the reveal punchline */}
      {showingCompact && (
        <motion.div
          className={mobile ? 'flex-1 overflow-hidden px-3 pb-12 pt-20' : 'flex-1 overflow-hidden px-8 pt-28 pb-16'}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <AgentInboxStage
            bundles={inboxModel.bundles}
            responses={inboxResponses}
            readProgress={compactProgress}
            humanTyping={false}
          />
        </motion.div>
      )}

      {/* Simulated Disclosure Banner */}
      <SimulatedDisclosure
        mobile={mobile}
        appMode={appMode}
        inferenceMode={inferenceMode}
        recordingMode={activeDemo?.recordingMode}
        engramAvailable={engramAvailable}
      />

      {/* Timeline strip */}
      <TimelineStrip mobile={mobile} />
    </div>
  );
}

function SimulatedDisclosure({
  mobile,
  appMode,
  inferenceMode,
  recordingMode,
  engramAvailable,
}: {
  mobile?: boolean;
  appMode: AppMode;
  inferenceMode: InferenceMode;
  recordingMode?: 'stateful' | 'stateless';
  engramAvailable: boolean;
}) {
  const copy = getDisclosureCopy({ appMode, inferenceMode, recordingMode, engramAvailable });
  if (!copy) return null;

  return (
    <div className={mobile ? 'absolute bottom-[3.5rem] left-3 right-3 z-30 flex justify-center pointer-events-none' : 'absolute bottom-[4.5rem] left-8 right-8 z-30 flex justify-center pointer-events-none'}>
      <div
        className="glass-chip-dark flex flex-col gap-1.5 rounded-xl px-4 py-3 ambient-shadow-dark max-w-[420px] backdrop-blur-md"
        style={{
          background: 'rgba(16,27,40,0.85)',
          border: '1px solid rgba(104,250,221,0.25)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(104,250,221,0.1) inset'
        }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--secondary-container)' }} />
          <span className="font-mono text-[9px] uppercase font-bold tracking-[0.2em]" style={{ color: 'var(--secondary-container)' }}>
            {copy.label}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed opacity-90 font-sans" style={{ color: 'var(--on-surface-dark)' }}>
          {copy.subtext}
        </p>
      </div>
    </div>
  );
}

type DisclosureCopy = {
  label: string;
  subtext: string;
};

function getDisclosureCopy({
  appMode,
  inferenceMode,
  recordingMode,
  engramAvailable,
}: {
  appMode: AppMode;
  inferenceMode: InferenceMode;
  recordingMode?: 'stateful' | 'stateless';
  engramAvailable: boolean;
}): DisclosureCopy | null {
  if (appMode === 'chat') {
    if (inferenceMode === 'stateful') {
      if (import.meta.env.VITE_STATEFUL_PROVIDER_MODE === 'stateful-engram' && engramAvailable) {
        return {
          label: 'Live Engram Session',
          subtext: 'You are connected to a live Engram server. Conversation state is saved as a model-layer snapshot after each turn and restored at the start of the next — no history is retransmitted.',
        };
      }
      return {
        label: 'Simulated Environment',
        subtext: 'The Engram backend is currently offline. This view simulates how the system retains context without transmitting the full history.',
      };
    }
    return {
      label: 'Stateless Session',
      subtext: 'The full conversation history is sent with every request. No state is retained between turns at the model layer.',
    };
  }

  if (appMode !== 'demo') return null;

  const recordedAs = recordingMode ?? 'stateless';

  if (recordedAs === 'stateful') {
    if (inferenceMode === 'stateful') {
      return {
        label: 'Recorded Engram Session',
        subtext: 'This is a real Engram session previously recorded for demonstrative comparison.',
      };
    }

    return {
      label: 'Stateless Reconstruction',
      subtext: 'This stateless baseline is rebuilt from the recorded Engram conversation JSON so the comparison follows the same turns.',
    };
  }

  if (inferenceMode === 'stateful') {
    return {
      label: 'Pre-recorded Simulated Session',
      subtext: 'This session was recorded statelessly and then reprocessed to emulate a stateful interaction.',
    };
  }

  return {
    label: 'Stateless Playback',
    subtext: 'This is a playback of a stateless recorded session, captured as the baseline for comparison.',
  };
}

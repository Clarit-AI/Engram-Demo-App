import { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
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
import { JsonStream } from './JsonStream';
import { ReReadHUD } from './ReReadHUD';
import { TimelineStrip } from './TimelineStrip';
import { PostArcControls } from './PostArcControls';
import { useStreamText, commonPrefixLength } from '../hooks/useStreamText';

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

/** Phase hold times between beats (ms) */
const HOLD_INTRO = 700;
const HOLD_COMPOSING = 650;  // user msg sits on chat pane before JSON starts re-reading it
const HOLD_SETTLED = 450;    // brief beat after the full stream (request + response) completes
const HOLD_PEAKING = 1500;

/**
 * Font size (px) applied to the JSON column based on current turn.
 * Shrinking the font reflows the text (wider effective box), letting
 * more content fit vertically while still FILLING the pane's width.
 * CSS transform:scale() was the wrong tool — it shrinks the rendered
 * box without reflowing, which caused content to visibly center with
 * empty side margins.
 */
function fontSizeForTurn(turn: number): number {
  if (turn <= 4) return 13;
  if (turn === 5) return 12;
  if (turn === 6) return 11;
  if (turn === 7) return 10;
  return 9;
}

export function ReReadStage() {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const totalTurns = useArcStore((s) => s.totalTurns);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const phase = useArcStore((s) => s.phase);
  const revealStep = useArcStore((s) => s.revealStep);
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const liveMessages = useChatStore((s) => s.messages);
  const liveAssistantBuffer = useChatStore((s) => s.liveAssistantBuffer);
  // Used in orchestrator effect below
  void totalTurns;
  void turnsCap;
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
    if (booted.current) return;
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
  }, [setCatalog, setActiveDemo, setAppMode, turnsCap]);

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

      const provider = getInferenceProvider(inferenceMode);
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
  }, [appMode, activeDemo, currentTurn, liveMessages, liveAssistantBuffer, inferenceMode, phase]);

  /** Prior turn full stream text — used to compute recall divergence */
  const priorPayloadText = useMemo(() => {
    if (currentTurn < 2) return '';
    if (appMode === 'chat') {
      // Build the prior turn's wire payload from chatStore history. In
      // stateless mode this gives a meaningful "recall" prefix; in
      // stateful mode the wire payload is already minimal so divergence
      // is essentially the whole thing (and that's the correct story).
      const userIdxs: number[] = [];
      liveMessages.forEach((m, i) => { if (m.role === 'user') userIdxs.push(i); });
      const priorUserIdx = userIdxs[currentTurn - 2];
      if (priorUserIdx === undefined) return '';
      const priorMessages = liveMessages.slice(0, priorUserIdx + 1);
      const provider = getInferenceProvider(inferenceMode);
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
  }, [activeDemo, currentTurn, appMode, liveMessages, inferenceMode]);

  const newContentStart = useMemo(() => {
    if (!priorPayloadText) return 0; // turn 1 → everything is new
    return commonPrefixLength(priorPayloadText, payloadText);
  }, [priorPayloadText, payloadText]);

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

  // Mirror streamedChars into the store so ChatPanel can sync its
  // thinking-dots → bubble swap + bubble content to the same clock.
  useEffect(() => {
    setStreamProgress(streamedChars);
  }, [streamedChars, setStreamProgress]);

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
        timer = scheduleNext('streaming', HOLD_COMPOSING);
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
        timer = scheduleNext('revealing', HOLD_PEAKING);
        break;

      default:
        break;
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [phase, currentTurn, totalTurns, activeDemo, appMode, setPhase, setTurn]);

  // ---- Content muted boundary ----
  // Everything up to `newContentStart` is "recall" — muted.
  const mutedUpTo = newContentStart;

  // ---- Scale-out "camera" via font-size reduction (reflows, fills width) ----
  const fontSizePx = fontSizeForTurn(Math.max(1, currentTurn));

  // ---- Stateful reveal: compact packet text for the punchline ----
  const compactPacketText = useMemo(() => {
    if (!activeDemo) return '';
    const convo = activeDemo.messages.filter((m) => m.role !== 'system');
    const userTurns = convo.filter((m) => m.role === 'user');
    const lastUser = userTurns[userTurns.length - 1]?.content ?? '';
    const ctxId = makeContextId(activeDemo.key + ':' + activeDemo.title);
    return buildCompactPacketText(lastUser, ctxId);
  }, [activeDemo]);

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

  // Decide which content the JSON column shows:
  //   - normal stream during streaming/settled/peaking
  //   - compact packet during revealing (post-collapse) and post-arc
  const showingCompact =
    phase === 'post-arc' ||
    (phase === 'revealing' &&
      (revealStep === 'compact-streaming' ||
        revealStep === 'badge' ||
        revealStep === 'finalized'));

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
      <ReReadHUD />

      {/* Stateless JSON column — visible during the demo arc; vacuums up on reveal */}
      {!showingCompact && (
        <motion.div
          className="flex-1 overflow-auto clinical-scroll px-8 pt-28 pb-16"
          initial={false}
          animate={
            isCollapsing
              ? {
                  fontSize: `${fontSizePx}px`,
                  scale: 0.05,
                  x: -240,
                  y: -180,
                  opacity: 0,
                  filter: 'blur(4px)',
                }
              : {
                  fontSize: `${fontSizePx}px`,
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
          {payloadText ? (
            <JsonStream
              text={payloadText}
              streamedChars={streamedChars}
              mutedUpTo={mutedUpTo}
              hideCursor={phase !== 'streaming'}
            />
          ) : (
            <div
              className="h-full flex items-center justify-center text-[12px] font-mono uppercase tracking-[0.2em]"
              style={{ color: 'var(--on-surface-dark-faint)' }}
            >
              Loading demo library…
            </div>
          )}
        </motion.div>
      )}

      {/* Compact packet — the reveal punchline */}
      {showingCompact && (
        <motion.div
          className="flex-1 overflow-hidden flex items-center justify-center px-8 pt-28 pb-16"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-full max-w-[480px]">
            <div
              className="text-[10px] font-mono uppercase tracking-[0.24em] mb-3"
              style={{ color: 'var(--on-surface-dark-muted)' }}
            >
              ↓ stateful payload
            </div>
            <div
              className="rounded-2xl p-6 ambient-shadow-dark"
              style={{
                background: 'var(--surface-container-high-dark)',
                border: '1px solid rgba(0,163,255,0.18)',
              }}
            >
              <JsonStream
                text={compactPacketText}
                streamedChars={
                  phase === 'post-arc' ||
                  revealStep === 'badge' ||
                  revealStep === 'finalized'
                    ? compactPacketText.length
                    : compactStreamed
                }
                hideCursor={
                  phase === 'post-arc' ||
                  revealStep === 'badge' ||
                  revealStep === 'finalized'
                }
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Post-arc controls — replay / actually-chat / mode toggle / demo picker */}
      <PostArcControls />

      {/* Timeline strip */}
      <TimelineStrip />
    </div>
  );
}

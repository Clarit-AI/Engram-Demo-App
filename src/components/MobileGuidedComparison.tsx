import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';
import { computeTurnMetrics } from '../lib/metrics';
import { ReReadStage } from './ReReadStage';
import { ChatPanel } from './ChatPanel';

type MobileView = 'user' | 'agent';

export function MobileGuidedComparison() {
  const reduced = useReducedMotion();
  const phase = useArcStore((s) => s.phase);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const responseBoundary = useArcStore((s) => s.responseBoundary);
  const streamedChars = useArcStore((s) => s.streamedChars);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const activeDemo = useArcStore((s) => s.activeDemo);
  const appMode = useArcStore((s) => s.appMode);

  const [activeView, setActiveView] = useState<MobileView>('user');
  const [noticeMode, setNoticeMode] = useState<'intro' | 'desktop' | 'dismissed'>('intro');

  const responseChars = Math.max(0, streamedChars - responseBoundary);
  const guidedView = useMemo<MobileView | null>(() => {
    if (phase === 'intro' || phase === 'composing' || phase === 'idle') return 'user';
    if (phase === 'streaming') return responseChars > 24 ? 'user' : 'agent';
    if (phase === 'revealing') return 'agent';
    return null;
  }, [phase, responseChars]);

  useEffect(() => {
    if (!guidedView) return;
    const timer = window.setTimeout(() => setActiveView(guidedView), 0);
    return () => window.clearTimeout(timer);
  }, [guidedView, currentTurn]);

  const stat = useMemo(() => {
    const turn = Math.max(1, currentTurn);
    if (inferenceMode === 'stateful') {
      return { label: 'Stateful', tokens: 34 };
    }
    if (!activeDemo) {
      return { label: 'Stateless', tokens: null };
    }
    const clamp = Math.min(turn, activeDemo.turnCount);
    return {
      label: 'Stateless',
      tokens: computeTurnMetrics(
        activeDemo.messages,
        activeDemo.model,
        clamp,
        undefined,
        activeDemo.comparative,
      ).reReadTokens,
    };
  }, [activeDemo, currentTurn, inferenceMode]);

  const stripCopy =
    inferenceMode === 'stateful'
      ? 'User sends one message. Model receives a context pointer.'
      : 'User sends one message. Model receives the full conversation.';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface">
      <header className="relative z-30 flex-none border-b border-black/10 bg-surface-container-lowest px-3 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3 overflow-hidden">
          <div className="min-w-0 flex-1">
            <div className="font-display text-[14px] font-semibold tracking-tight text-on-surface">
              Context comparison
            </div>
            <div className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">
              Guided mobile walkthrough
            </div>
          </div>
          <div
            className="flex max-w-[172px] shrink-0 rounded-full p-0.5"
            role="tablist"
            aria-label="Mobile comparison view"
            style={{ background: 'var(--surface-container)' }}
          >
            <ViewTab active={activeView === 'user'} onClick={() => setActiveView('user')}>
              User
            </ViewTab>
            <ViewTab active={activeView === 'agent'} onClick={() => setActiveView('agent')}>
              Agent
            </ViewTab>
          </div>
        </div>

        <div
          className="mt-3 rounded-xl px-3 py-2"
          style={{
            background:
              inferenceMode === 'stateful'
                ? 'rgba(104,250,221,0.10)'
                : 'rgba(0,163,255,0.08)',
            border:
              inferenceMode === 'stateful'
                ? '1px solid rgba(104,250,221,0.22)'
                : '1px solid rgba(0,163,255,0.18)',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[12px] font-medium leading-snug text-on-surface">
              {stripCopy}
            </p>
            <div className="shrink-0 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
              <div>Turn {Math.max(1, currentTurn)}</div>
              <div>{stat.tokens == null ? stat.label : `${stat.tokens} tok`}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <MobilePane
          active={activeView === 'agent'}
          direction="left"
          reduced={Boolean(reduced)}
          label="Agent view"
        >
          <ReReadStage mobile />
        </MobilePane>
        <MobilePane
          active={activeView === 'user'}
          direction="right"
          reduced={Boolean(reduced)}
          label="User view"
        >
          <ChatPanel mobile />
        </MobilePane>
      </main>

      <AnimatePresence>
        {noticeMode !== 'dismissed' && appMode === 'demo' && (
          <motion.div
            className="absolute inset-0 z-50 bg-black/34"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute bottom-5 left-4 right-4 rounded-2xl bg-surface-container-lowest px-5 py-5 ambient-shadow"
              initial={reduced ? false : { y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              {noticeMode === 'desktop' ? (
                <>
                  <h2 className="font-display text-[18px] font-semibold tracking-tight text-on-surface">
                    Desktop gives the clearest comparison.
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                    Open this URL on a computer, or rotate a larger device if you want more
                    horizontal room. Mobile will continue as a guided walkthrough.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-[18px] font-semibold tracking-tight text-on-surface">
                    This simulation is clearest on desktop.
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                    Mobile uses a guided walkthrough that switches between the clean user
                    chat and the model&apos;s full-context inbox.
                  </p>
                </>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setNoticeMode('dismissed')}
                  className="sig-gradient min-h-11 min-w-0 flex-1 rounded-full px-4 text-[13px] font-semibold text-white"
                >
                  Start mobile walkthrough
                </button>
                <button
                  type="button"
                  onClick={() => setNoticeMode('desktop')}
                  className="min-h-11 shrink-0 rounded-full px-4 text-[13px] font-semibold text-on-surface"
                  style={{
                    background: 'var(--surface-container)',
                    border: '1px solid rgba(25,28,30,0.10)',
                  }}
                >
                  Desktop
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="relative min-h-9 rounded-full px-3.5 text-[11px] font-semibold transition-colors"
      style={{ color: active ? 'var(--on-surface)' : 'var(--text-muted)' }}
    >
      {active && (
        <motion.span
          layoutId="mobile-view-tab"
          className="absolute inset-0 rounded-full bg-surface-container-lowest shadow-[0_8px_20px_-16px_rgba(25,28,30,0.45)]"
          transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

function MobilePane({
  active,
  direction,
  reduced,
  label,
  children,
}: {
  active: boolean;
  direction: 'left' | 'right';
  reduced: boolean;
  label: string;
  children: ReactNode;
}) {
  const offset = direction === 'left' ? -20 : 20;

  return (
    <motion.section
      aria-label={label}
      aria-hidden={!active}
      className="absolute inset-0 h-full w-full overflow-hidden"
      animate={{
        opacity: active ? 1 : 0,
        x: reduced ? 0 : active ? 0 : offset,
      }}
      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{
        pointerEvents: active ? 'auto' : 'none',
        visibility: active ? 'visible' : 'hidden',
      }}
    >
      {children}
    </motion.section>
  );
}
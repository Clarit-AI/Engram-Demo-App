import { memo } from 'react';
import { motion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';

const MIN_TURNS = 1;

/**
 * TimelineStrip — bottom progress ticker for the agent pane.
 *
 * Playback uses the loaded demo's turn count; live chat grows with the
 * conversation until the visual cap is reached. Past turns render as muted
 * dots, the active turn renders as a glowing signal-blue dot, and future
 * playback turns render as ghost outlines. The right edge carries the product
 * copyright line.
 */
export const TimelineStrip = memo(function TimelineStrip({ mobile = false }: { mobile?: boolean }) {
  const currentTurn = useArcStore((s) => s.currentTurn);
  const totalTurns = useArcStore((s) => s.totalTurns);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const appMode = useArcStore((s) => s.appMode);

  const sourceTurnCount = appMode === 'chat'
    ? Math.max(currentTurn, MIN_TURNS)
    : Math.max(totalTurns, currentTurn, MIN_TURNS);
  const dotCount = Math.min(sourceTurnCount, turnsCap);
  const activeTurn = Math.min(Math.max(currentTurn, MIN_TURNS), dotCount);

  return (
    <div
      className={mobile ? 'absolute bottom-0 left-0 right-0 px-4 py-3 z-10 pointer-events-none' : 'absolute bottom-0 left-0 right-0 px-8 py-4 z-10 pointer-events-none'}
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, rgba(10,17,25,0.85) 60%, rgba(10,17,25,1) 100%)',
      }}
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: dotCount }, (_, i) => {
          const n = i + 1;
          const state: 'past' | 'current' | 'future' =
            n < activeTurn ? 'past' : n === activeTurn ? 'current' : 'future';
          const bg =
            state === 'current'
              ? 'var(--primary-container)'
              : state === 'past'
                ? 'var(--on-surface-dark-muted)'
                : 'transparent';
          return (
            <motion.div
              key={n}
              className="h-1.5 w-1.5 rounded-full"
              animate={{
                scale: state === 'current' ? 1.35 : 1,
                boxShadow:
                  state === 'current'
                    ? '0 0 12px rgba(0,163,255,0.75)'
                    : '0 0 0 rgba(0,163,255,0)',
              }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              style={{
                background: bg,
                border:
                  state === 'future'
                    ? '1px solid rgba(190,199,212,0.2)'
                    : 'none',
              }}
            />
          );
        })}
        <div
          className="flex-1 h-px mx-2"
          style={{ background: 'rgba(190,199,212,0.08)' }}
        />
        <span
          className="text-[9px] font-mono tracking-[0.14em]"
          style={{ color: 'rgba(190,199,212,0.68)' }}
        >
          Copyright © 2026{' '}
          <a
            href="https://clarit.ai"
            target="_blank"
            rel="noreferrer"
            className="pointer-events-auto underline-offset-2 transition-colors hover:underline"
            style={{ color: 'rgba(190,199,212,0.82)' }}
          >
            Clarit.ai
          </a>{' '}
          - The cure for Agent Amnesia
        </span>
      </div>
    </div>
  );
});

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';

/**
 * TimelineStrip — horizontal progress ticker of N turns.
 * Past turns: filled muted dot
 * Current turn: filled signal-blue dot with glow + spring-scale 1.35×
 * Future turns: ghost-bordered outline dot
 *
 * The phase label on the right is a diagnostic cue; it quietly changes
 * as the arc moves through its state machine (streaming / awaiting /
 * responding / settled / peaking / revealing / post-arc).
 */
export const TimelineStrip = memo(function TimelineStrip({ mobile = false }: { mobile?: boolean }) {
  const currentTurn = useArcStore((s) => s.currentTurn);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const phase = useArcStore((s) => s.phase);

  return (
    <div
      className={mobile ? 'absolute bottom-0 left-0 right-0 px-4 py-3 z-10 pointer-events-none' : 'absolute bottom-0 left-0 right-0 px-8 py-4 z-10 pointer-events-none'}
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, rgba(10,17,25,0.85) 60%, rgba(10,17,25,1) 100%)',
      }}
    >
      <div className="flex items-center gap-2">
        {Array.from({ length: turnsCap }, (_, i) => {
          const n = i + 1;
          const t = Math.max(1, currentTurn);
          const state: 'past' | 'current' | 'future' =
            n < t ? 'past' : n === t ? 'current' : 'future';
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
          className="text-[9px] font-mono uppercase tracking-[0.22em]"
          style={{ color: 'var(--on-surface-dark-faint)' }}
        >
          {phase}
        </span>
      </div>
    </div>
  );
});

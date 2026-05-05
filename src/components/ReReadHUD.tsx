import { memo, useMemo } from 'react';
import { useArcStore } from '../store/arcStore';
import {
  computeTurnMetrics,
  computeSessionMetrics,
  DEFAULT_COST_PER_MTOK,
} from '../lib/metrics';
import { AnimatedNumber } from './AnimatedNumber';

/**
 * ReReadHUD — the in-stage diagnostic readout.
 *
 * Floats top-right in the dark pane as a single glass-chip column:
 *   • Turn X / 8 + demo title
 *   • Re-read THIS TURN — big numeric, signature gradient
 *   • Session total  — secondary numeric
 *   • Equivalent pages — translates abstract tokens for VC audiences
 *   • Live cost — USD
 *
 * All values spring between turns via AnimatedNumber. The BIG number is
 * the one that grows visibly absurd as the arc progresses — that's the
 * headline the viewer walks away with.
 */
export const ReReadHUD = memo(function ReReadHUD() {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const totalTurns = useArcStore((s) => s.totalTurns);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const phase = useArcStore((s) => s.phase);
  const revealStep = useArcStore((s) => s.revealStep);

  const turn = Math.max(1, currentTurn);

  // Stateful contrast: once the reveal has flipped to the compact packet,
  // the HUD shows the dramatic drop-off — ~34 tok per turn instead of
  // thousands. Color shifts from sig-gradient (drama) to secondary teal
  // ("data success" semantic per spec).
  const isStateful =
    phase === 'post-arc' ||
    (phase === 'revealing' &&
      (revealStep === 'compact-streaming' ||
        revealStep === 'badge' ||
        revealStep === 'finalized'));

  const metrics = useMemo(() => {
    if (!activeDemo) return null;
    const clamp = Math.min(turn, activeDemo.turnCount);
    const turnM = computeTurnMetrics(activeDemo.messages, activeDemo.model, clamp);
    const sessionM = computeSessionMetrics(activeDemo.messages, activeDemo.model, clamp);
    return { ...turnM, session: sessionM };
  }, [activeDemo, turn]);

  if (!activeDemo || !metrics) {
    return (
      <div className="absolute top-4 right-4 z-20">
        <div
          className="glass-chip-dark rounded-2xl px-4 py-3 text-[11px] font-mono uppercase tracking-[0.14em]"
          style={{ color: 'var(--on-surface-dark-faint)' }}
        >
          booting…
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-4 right-4 z-20 pointer-events-none">
      <div className="glass-chip-dark rounded-2xl px-5 py-4 min-w-[240px] ambient-shadow-dark">
        {/* Row 1 — turn indicator + demo title */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'var(--on-surface-dark-muted)' }}
          >
            <span>Turn</span>
            <span
              className="tabular-nums font-semibold text-[13px]"
              style={{ color: 'var(--on-surface-dark)' }}
            >
              {turn}
            </span>
            <span style={{ color: 'var(--on-surface-dark-faint)' }}>
              /&nbsp;{totalTurns || turnsCap}
            </span>
          </div>
          <span
            className="text-[9px] font-mono uppercase tracking-[0.14em] truncate max-w-[140px]"
            style={{ color: 'var(--on-surface-dark-faint)' }}
            title={activeDemo.title}
          >
            {activeDemo.title}
          </span>
        </div>

        {/* Row 2 — BIG re-read number (headline). Drops to ~34 tok and
            shifts to teal once stateful reveal lands. */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <div
              className="text-[9px] font-mono uppercase tracking-[0.22em]"
              style={{ color: 'var(--on-surface-dark-muted)' }}
            >
              {isStateful ? 'Re-read THIS turn' : 'Re-read this turn'}
            </div>
            {isStateful && (
              <span
                className="rounded-full px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.18em] font-semibold"
                style={{
                  background: 'rgba(104, 250, 221, 0.16)',
                  color: 'var(--secondary-container)',
                  border: '1px solid rgba(104, 250, 221, 0.32)',
                }}
              >
                Stateful
              </span>
            )}
          </div>
          <AnimatedNumber
            value={isStateful ? 34 : metrics.reReadTokens}
            suffix=" tok"
            className={
              isStateful
                ? 'font-mono font-bold text-[26px] leading-none tabular-nums'
                : 'font-mono font-bold text-[26px] leading-none tabular-nums sig-gradient-text'
            }
            style={
              isStateful ? { color: 'var(--secondary-container)' } : undefined
            }
          />
        </div>

        {/* Divider via tonal shift (no line per spec) */}
        <div
          className="h-px mb-3"
          style={{ background: 'rgba(190,199,212,0.08)' }}
        />

        {/* Row 3 — session total */}
        <div className="flex items-baseline justify-between mb-2">
          <span
            className="text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'var(--on-surface-dark-muted)' }}
          >
            Session total
          </span>
          <AnimatedNumber
            value={metrics.session.totalTokens}
            suffix=" tok"
            className="font-mono font-semibold text-[14px] tabular-nums"
            style={{ color: 'var(--on-surface-dark)' }}
          />
        </div>

        {/* Row 4 — equivalent pages */}
        <div className="flex items-baseline justify-between mb-2">
          <span
            className="text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'var(--on-surface-dark-muted)' }}
          >
            ≈ Pages re-read
          </span>
          <AnimatedNumber
            value={metrics.session.totalPages}
            decimals={1}
            className="font-mono font-semibold text-[13px] tabular-nums"
            style={{ color: 'var(--on-surface-dark)' }}
          />
        </div>

        {/* Row 5 — compute cost */}
        <div className="flex items-baseline justify-between">
          <span
            className="text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'var(--on-surface-dark-muted)' }}
          >
            Input cost
          </span>
          <AnimatedNumber
            value={metrics.session.totalCostUsd}
            decimals={4}
            prefix="$"
            comma={false}
            className="font-mono font-semibold text-[13px] tabular-nums"
            style={{ color: 'var(--secondary-container)' }}
          />
        </div>

        {/* Fine print — model + pricing */}
        <div
          className="mt-3 pt-2 text-[8px] font-mono uppercase tracking-[0.22em] text-right"
          style={{
            color: 'var(--on-surface-dark-faint)',
            borderTop: '1px solid rgba(190,199,212,0.06)',
          }}
        >
          {activeDemo.model.split('/').pop()} · ${DEFAULT_COST_PER_MTOK.toFixed(2)}/Mtok
        </div>
      </div>
    </div>
  );
});

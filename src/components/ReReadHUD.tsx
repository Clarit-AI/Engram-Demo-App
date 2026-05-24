import { memo, useMemo } from 'react';
import { useArcStore } from '../store/arcStore';
import { StateBadge } from './StateBadge';
import {
  computeTurnMetrics,
  computeSessionMetrics,
  computeStatefulTurnMetrics,
  computeStatefulSessionMetrics,
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
export const ReReadHUD = memo(function ReReadHUD({ mobile = false }: { mobile?: boolean }) {
  const activeDemo = useArcStore((s) => s.activeDemo);
  const currentTurn = useArcStore((s) => s.currentTurn);
  const totalTurns = useArcStore((s) => s.totalTurns);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const phase = useArcStore((s) => s.phase);
  const revealStep = useArcStore((s) => s.revealStep);
  const inferenceMode = useArcStore((s) => s.inferenceMode);

  const turn = Math.max(1, currentTurn);

  // Stateful contrast: once the reveal has flipped to the compact packet,
  // the HUD shows the dramatic drop-off — ~34 tok per turn instead of
  // thousands. Color shifts from sig-gradient (drama) to secondary teal
  // ("data success" semantic per spec).
  const isStateful =
    inferenceMode === 'stateful' ||
    phase === 'post-arc' ||
    (phase === 'revealing' &&
      (revealStep === 'compact-streaming' ||
        revealStep === 'badge' ||
        revealStep === 'finalized'));

  const metrics = useMemo(() => {
    if (!activeDemo) return null;
    const clamp = Math.min(turn, activeDemo.turnCount);
    const turnM = isStateful
      ? computeStatefulTurnMetrics(activeDemo.messages, activeDemo.model, clamp, undefined, activeDemo.comparative)
      : computeTurnMetrics(activeDemo.messages, activeDemo.model, clamp, undefined, activeDemo.comparative);
    const sessionM = isStateful
      ? computeStatefulSessionMetrics(activeDemo.messages, activeDemo.model, clamp, undefined, activeDemo.comparative)
      : computeSessionMetrics(activeDemo.messages, activeDemo.model, clamp, undefined, activeDemo.comparative);
    return { ...turnM, session: sessionM };
  }, [activeDemo, isStateful, turn]);

  if (!activeDemo || !metrics) {
    return (
      <div className={mobile ? 'absolute left-3 right-3 top-3 z-20' : 'absolute left-8 right-8 top-4 z-20'}>
        <div
          className="glass-chip-dark rounded-2xl px-4 py-3 text-[11px] font-mono uppercase tracking-[0.14em] ambient-shadow-dark"
          style={{ color: 'var(--on-surface-dark-faint)' }}
        >
          booting…
        </div>
      </div>
    );
  }

  return (
    <div className={mobile ? 'absolute left-3 right-3 top-3 z-20 pointer-events-none' : 'absolute left-8 right-8 top-4 z-20 pointer-events-none'}>
      <div className={mobile ? 'glass-chip-dark flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ambient-shadow-dark' : 'glass-chip-dark flex items-center justify-between gap-5 rounded-2xl px-5 py-3 ambient-shadow-dark'}>
        <div className="flex min-w-0 items-center gap-2.5">
          <StateBadge mode={isStateful ? 'stateful' : 'stateless'} pane="agent" />
          <div
            className="font-display text-[15px] font-bold tracking-tight"
            style={{ color: 'var(--on-surface-dark)' }}
          >
            What Agents See
          </div>
        </div>

        <div className={mobile ? 'flex shrink-0 items-center gap-3' : 'flex shrink-0 items-center gap-5'}>
          <MetricLabel label="Turn" value={`${turn} / ${totalTurns || turnsCap}`} />
          <div>
            <div
              className="text-[8px] font-mono uppercase tracking-[0.2em]"
              style={{ color: 'var(--on-surface-dark-muted)' }}
            >
              Re-read
            </div>
            <AnimatedNumber
              value={metrics.reReadTokens}
              suffix=" tok"
              className={
                isStateful
                  ? 'font-mono font-bold text-[18px] leading-none tabular-nums'
                  : 'font-mono font-bold text-[18px] leading-none tabular-nums sig-gradient-text'
              }
              style={isStateful ? { color: 'var(--secondary-container)' } : undefined}
            />
          </div>
          {!mobile && (
            <>
              <MetricNumber
                label="Cost"
                value={metrics.session.totalCostUsd}
                decimals={4}
                prefix="$"
                comma={false}
                accent
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

function MetricLabel({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[8px] font-mono uppercase tracking-[0.2em]"
        style={{ color: 'var(--on-surface-dark-muted)' }}
      >
        {label}
      </div>
      <div
        className="font-mono text-[13px] font-semibold tabular-nums"
        style={{ color: 'var(--on-surface-dark)' }}
      >
        {value}
      </div>
    </div>
  );
}

function MetricNumber({
  label,
  value,
  decimals,
  prefix,
  suffix,
  comma,
  accent = false,
}: {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  comma?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div
        className="text-[8px] font-mono uppercase tracking-[0.2em]"
        style={{ color: 'var(--on-surface-dark-muted)' }}
      >
        {label}
      </div>
      <AnimatedNumber
        value={value}
        decimals={decimals}
        prefix={prefix}
        suffix={suffix}
        comma={comma}
        className="font-mono text-[13px] font-semibold tabular-nums"
        style={{ color: accent ? 'var(--secondary-container)' : 'var(--on-surface-dark)' }}
      />
    </div>
  );
}
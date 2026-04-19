import { memo, useEffect } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import { instrument } from '../lib/springs';

interface CapacityGaugeProps {
  /** 0–100 efficiency ratio */
  efficiency: number;
  /** True when stateless demo is active — adds subtle needle jitter. */
  jittering?: boolean;
  /** Optional label below the gauge */
  label?: string;
  width?: number;
  height?: number;
}

/**
 * CapacityGauge — a 180° instrument-panel dial. Drop-in visual for the
 * "efficient %" metric. Needle swings from -90° (0%) to +90° (100%)
 * with a spring. The arc fill blends from burn (low) to clarit (high)
 * so the dial face itself communicates state without reading numerals.
 *
 * Designed as a pure SVG + Framer Motion component — no Rive runtime.
 * Swap to Rive later by replacing the internals; keep the props identical.
 *
 * Perf:
 *   - Memoized, renders once per efficiency change.
 *   - Needle rotation driven by a MotionValue + spring (off the React
 *     render path).
 *   - Jitter is a secondary continuous loop added to the same transform
 *     via useTransform, so the two don't fight each other.
 *   - Respects prefers-reduced-motion: jitter disabled, spring becomes a
 *     plain `set`.
 */
export const CapacityGauge = memo(function CapacityGauge({
  efficiency,
  jittering = false,
  label,
  width = 56,
  height = 34,
}: CapacityGaugeProps) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(efficiency);
  const jitter = useMotionValue(0);

  // Spring to target efficiency on change.
  useEffect(() => {
    if (reduced) {
      mv.set(efficiency);
      return;
    }
    const controls = animate(mv, efficiency, instrument);
    return () => controls.stop();
  }, [efficiency, mv, reduced]);

  // Continuous subtle jitter (±1.5° / ~1.2 Hz) when enabled. Added to the
  // primary needle rotation via useTransform.
  useEffect(() => {
    if (reduced || !jittering) {
      jitter.set(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      jitter.set(Math.sin(t * 7.5) * 1.4 + Math.sin(t * 3.1) * 0.6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [jittering, reduced, jitter]);

  // Needle angle: -90° at 0%, +90° at 100%.
  const baseAngle = useTransform(mv, (v) => -90 + (v / 100) * 180);
  const needleAngle = useTransform([baseAngle, jitter], (values) => {
    const [a, j] = values as [number, number];
    return a + j;
  });

  // Numeric readout
  const readout = useTransform(mv, (v) => `${Math.round(v)}%`);

  // Color hue for readout / needle stroke — burn at low, clarit at high.
  const accentColor = useTransform(mv, (v) => {
    if (v >= 80) return 'var(--clarit-600)';
    if (v >= 50) return 'var(--signal-600)';
    return 'var(--burn-600)';
  });

  return (
    <div className="flex flex-col items-start min-w-[56px]">
      {label && (
        <span className="text-[9px] uppercase tracking-[0.14em] text-text-muted font-mono">
          {label}
        </span>
      )}
      <div className="flex items-baseline gap-1.5">
        <svg
          width={width}
          height={height}
          viewBox="0 0 100 60"
          aria-hidden
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Dial arc gradient — burn (left) → signal mid → clarit (right) */}
            <linearGradient id="gauge-arc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--burn-400)" />
              <stop offset="50%" stopColor="var(--signal-400)" />
              <stop offset="100%" stopColor="var(--clarit-500)" />
            </linearGradient>
          </defs>

          {/* Dial arc track (background) */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--border-default)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Dial arc gradient overlay — always full width, lets the
              hue communicate state at a glance */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="url(#gauge-arc)"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Tick marks at 0, 25, 50, 75, 100% */}
          {[0, 25, 50, 75, 100].map((pct) => {
            const angle = (Math.PI * (1 - pct / 100));
            const r1 = 42;
            const r2 = pct % 50 === 0 ? 48 : 46;
            const x1 = 50 + Math.cos(angle) * r1;
            const y1 = 50 - Math.sin(angle) * r1;
            const x2 = 50 + Math.cos(angle) * r2;
            const y2 = 50 - Math.sin(angle) * r2;
            return (
              <line
                key={pct}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--text-muted)"
                strokeWidth={pct % 50 === 0 ? 1.2 : 0.8}
                strokeLinecap="round"
              />
            );
          })}

          {/* Needle — rotated from dial center */}
          <motion.g
            style={{
              rotate: needleAngle,
              transformOrigin: '50px 50px',
            }}
          >
            <line
              x1="50"
              y1="50"
              x2="50"
              y2="14"
              stroke="var(--text-primary)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* Needle tip */}
            <circle cx="50" cy="14" r="1.8" fill="var(--text-primary)" />
          </motion.g>

          {/* Pivot cap */}
          <circle
            cx="50"
            cy="50"
            r="3"
            fill="var(--bg-surface)"
            stroke="var(--text-secondary)"
            strokeWidth="1"
          />
          <circle cx="50" cy="50" r="1" fill="var(--text-secondary)" />
        </svg>
        <motion.span
          className="font-mono text-[13px] font-semibold tabular-nums"
          style={{ color: accentColor }}
        >
          {readout}
        </motion.span>
      </div>
    </div>
  );
});

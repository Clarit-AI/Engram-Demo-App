import { memo, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { calculateCost } from '../utils/format';
import { ModelSelector } from './ModelSelector';
import { CapacityGauge } from './CapacityGauge';
import { instrument, toggle } from '../lib/springs';

type MetricColor = 'default' | 'clarit' | 'burn' | 'warn' | 'signal';

export function MetricsBar() {
  const mode = useDemoStore((s) => s.mode);
  const setMode = useDemoStore((s) => s.setMode);
  const currentTurn = useDemoStore((s) => s.currentTurn);
  const totalTokensWasted = useDemoStore((s) => s.totalTokensWasted);
  const totalTokensSent = useDemoStore((s) => s.totalTokensSent);
  const redundancyPercent = useDemoStore((s) => s.redundancyPercent);
  const scaleMultiplier = useDemoStore((s) => s.scaleMultiplier);
  const toggleScaleMultiplier = useDemoStore((s) => s.toggleScaleMultiplier);
  const demoPlaying = useDemoStore((s) => s.demoPlaying);
  const cost = calculateCost(totalTokensSent) * scaleMultiplier;
  const efficiencyPercent = totalTokensSent > 0 ? 100 - redundancyPercent : 100;

  return (
    <header
      className="relative flex-none px-4 py-2.5 z-30"
      style={{
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
        borderBottom: '1px solid var(--border-glass)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 24px -12px rgba(0,71,255,0.12)',
      }}
    >
      <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
        {/* Left: brand + mode toggle */}
        <div className="flex items-center gap-4">
          <span className="font-display text-[15px] font-bold text-text-primary tracking-tight">
            clarit.ai
          </span>

          <ModeToggle mode={mode} setMode={setMode} />

          {demoPlaying && (
            <motion.span
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 text-[10px] font-mono tracking-wider uppercase text-signal-700 bg-signal-50/80 border border-signal-200/70 px-2 py-0.5 rounded-full"
            >
              <BreathingDot color="var(--signal-500)" />
              Demo Playing
            </motion.span>
          )}
        </div>

        {/* Center: metrics */}
        <div className="hidden md:flex items-center gap-5">
          <Metric
            label="Resent"
            value={
              mode === 'stateless'
                ? Math.max(
                    0,
                    totalTokensSent - (useDemoStore.getState().currentNewTokens || 0),
                  )
                : 0
            }
            format="comma"
            color={totalTokensWasted > 200 ? 'burn' : 'default'}
            capacity={Math.min(totalTokensSent / 5000, 1)}
          />
          <Metric
            label="Wasted"
            value={totalTokensWasted}
            format="comma"
            color={totalTokensWasted > 0 ? 'burn' : 'default'}
            capacity={Math.min(totalTokensWasted / 3000, 1)}
          />
          <Metric
            label="Cost"
            value={cost}
            format="cost"
            color={cost > 0 ? 'burn' : 'default'}
            suffix={scaleMultiplier > 1 ? '×1K' : ''}
            onSuffixClick={toggleScaleMultiplier}
            capacity={Math.min(cost / 0.05, 1)}
          />
          <Metric
            label="Redundant"
            value={redundancyPercent}
            format="percent"
            color={redundancyPercent > 60 ? 'burn' : redundancyPercent > 30 ? 'warn' : 'clarit'}
            capacity={redundancyPercent / 100}
          />
          <CapacityGauge
            label="Efficient"
            efficiency={efficiencyPercent}
            jittering={mode === 'stateless' && efficiencyPercent < 80}
          />
        </div>

        {/* Right: model selector + turn */}
        <div className="flex items-center gap-3">
          <ModelSelector />
          <span className="flex items-baseline gap-1 text-[10px] uppercase tracking-[0.12em] text-text-muted font-mono">
            Turn
            <span className="text-text-primary font-semibold tabular-nums">
              {currentTurn}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

/** Sliding layoutId mode toggle with shimmer on switch. */
function ModeToggle({
  mode,
  setMode,
}: {
  mode: 'stateless' | 'stateful';
  setMode: (m: 'stateless' | 'stateful') => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="relative flex items-center p-0.5 rounded-full bg-bg-secondary/70 border border-border-default/60">
      {(['stateless', 'stateful'] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="relative px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors"
            style={{
              color: active
                ? '#FFFFFF'
                : 'var(--text-secondary)',
              zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId="mode-indicator"
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    m === 'stateful'
                      ? 'linear-gradient(135deg, var(--clarit-500), var(--clarit-600))'
                      : 'linear-gradient(135deg, var(--burn-500), var(--burn-600))',
                  boxShadow:
                    m === 'stateful'
                      ? '0 4px 12px -4px rgba(0,191,165,0.45)'
                      : '0 4px 12px -4px rgba(232,148,96,0.45)',
                  zIndex: -1,
                }}
                transition={reduced ? { duration: 0 } : toggle}
              />
            )}
            {/* Shimmer swipe on the active pill */}
            {active && !reduced && (
              <motion.span
                key={`${m}-shimmer`}
                initial={{ x: '-120%', opacity: 0.8 }}
                animate={{ x: '220%', opacity: 0 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 w-1/2 rounded-full pointer-events-none"
                style={{
                  background:
                    'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                  mixBlendMode: 'overlay',
                  zIndex: 0,
                }}
              />
            )}
            <span className="relative">{m === 'stateless' ? 'Stateless' : 'Stateful'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Memoized breathing dot — isolated per Section 4/Rule 9C. */
const BreathingDot = memo(function BreathingDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color, boxShadow: `0 0 0 0 ${color}` }}
      animate={
        reduced
          ? {}
          : {
              scale: [1, 1.35, 1],
              opacity: [0.9, 1, 0.9],
            }
      }
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
});

function Metric({
  label,
  value,
  format,
  color = 'default',
  suffix,
  onSuffixClick,
  capacity = 0,
}: {
  label: string;
  value: number;
  format: 'int' | 'comma' | 'cost' | 'percent';
  color?: MetricColor;
  suffix?: string;
  onSuffixClick?: () => void;
  capacity?: number;
}) {
  const colorVar =
    color === 'clarit'
      ? 'var(--clarit-600)'
      : color === 'burn'
        ? 'var(--burn-600)'
        : color === 'warn'
          ? 'var(--burn-400)'
          : color === 'signal'
            ? 'var(--signal-600)'
            : 'var(--text-primary)';

  const meterFrom =
    color === 'clarit'
      ? 'var(--clarit-300)'
      : color === 'burn'
        ? 'var(--burn-300)'
        : color === 'warn'
          ? 'var(--burn-200)'
          : 'var(--signal-300)';

  const meterTo =
    color === 'clarit'
      ? 'var(--clarit-600)'
      : color === 'burn'
        ? 'var(--burn-600)'
        : color === 'warn'
          ? 'var(--burn-500)'
          : 'var(--signal-600)';

  return (
    <div className="flex flex-col items-start min-w-[56px]">
      <span className="text-[9px] uppercase tracking-[0.14em] text-text-muted font-mono">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <AnimatedNumber
          value={value}
          format={format}
          style={{ color: colorVar }}
        />
        {suffix && (
          <button
            onClick={onSuffixClick}
            className="text-[9px] font-mono text-text-muted hover:text-text-secondary cursor-pointer"
          >
            {suffix}
          </button>
        )}
      </div>
      {/* Capacity meter — 2px instrument readout */}
      <CapacityMeter from={meterFrom} to={meterTo} ratio={capacity} />
    </div>
  );
}

/** Instrument-style numeric that springs between integer values. */
function AnimatedNumber({
  value,
  format,
  style,
}: {
  value: number;
  format: 'int' | 'comma' | 'cost' | 'percent';
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const prev = useRef(value);
  const display = useTransform(mv, (v) => formatValue(v, format));
  const [text, setText] = useState(() => formatValue(value, format));

  useEffect(() => {
    const unsub = display.on('change', (v) => setText(v));
    return () => unsub();
  }, [display]);

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      prev.current = value;
      return;
    }
    const controls = animate(mv, value, instrument);
    prev.current = value;
    return () => controls.stop();
  }, [value, reduced, mv]);

  return (
    <span
      className="font-mono text-[13px] font-semibold tabular-nums"
      style={style}
    >
      {text}
    </span>
  );
}

function formatValue(v: number, format: 'int' | 'comma' | 'cost' | 'percent') {
  if (format === 'cost') return `$${v.toFixed(4)}`;
  if (format === 'percent') return `${Math.round(v)}%`;
  if (format === 'comma') return Math.round(v).toLocaleString();
  return String(Math.round(v));
}

function CapacityMeter({
  ratio,
  from,
  to,
}: {
  ratio: number;
  from: string;
  to: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <div className="mt-1 h-[2px] w-14 rounded-full bg-border-default/60 overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${from}, ${to})`,
        }}
        initial={false}
        animate={{ width: `${clamped * 100}%` }}
        transition={instrument}
      />
    </div>
  );
}

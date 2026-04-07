import { motion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { calculateCost } from '../utils/format';
import { ModelSelector } from './ModelSelector';

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
    <header className="flex-none bg-bg-surface border-b border-border-default shadow-sm px-4 py-2">
      <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
        {/* Left: brand + mode toggle */}
        <div className="flex items-center gap-4">
          <span className="font-bold text-text-primary tracking-tight">clarit.ai</span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('stateless')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                mode === 'stateless'
                  ? 'bg-waste-500 text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-primary'
              }`}
            >
              Stateless
            </button>
            <button
              onClick={() => setMode('stateful')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                mode === 'stateful'
                  ? 'bg-clarit-500 text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-primary'
              }`}
            >
              Stateful
            </button>
          </div>

          {demoPlaying && (
            <span className="text-xs text-clarit-600 bg-clarit-50 px-2 py-0.5 rounded-full font-mono">
              DEMO PLAYING
            </span>
          )}
        </div>

        {/* Center: metrics */}
        <div className="hidden md:flex items-center gap-6">
          <Metric
            label="Messages Resent"
            value={mode === 'stateless' ? Math.max(0, totalTokensSent - (useDemoStore.getState().currentNewTokens || 0)) : 0}
            format="int"
            color={totalTokensWasted > 200 ? 'waste' : 'default'}
          />
          <Metric
            label="Tokens Wasted"
            value={totalTokensWasted}
            format="comma"
            color={totalTokensWasted > 0 ? 'waste' : 'default'}
          />
          <Metric
            label="Cost Burned"
            value={cost}
            format="cost"
            color={cost > 0 ? 'waste' : 'default'}
            suffix={scaleMultiplier > 1 ? ' (×1K)' : ''}
            onSuffixClick={toggleScaleMultiplier}
          />
          <Metric
            label="Redundant"
            value={redundancyPercent}
            format="percent"
            color={redundancyPercent > 60 ? 'waste' : redundancyPercent > 30 ? 'warn' : 'clarit'}
          />
          <Metric
            label="Efficient"
            value={efficiencyPercent}
            format="percent"
            color={efficiencyPercent > 80 ? 'clarit' : efficiencyPercent > 50 ? 'warn' : 'waste'}
          />
        </div>

        {/* Right: model selector + turn count */}
        <div className="flex items-center gap-3">
          <ModelSelector />
          <span className="text-xs text-text-muted font-mono">
            Turn {currentTurn}
          </span>
        </div>
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  format,
  color = 'default',
  suffix,
  onSuffixClick,
}: {
  label: string;
  value: number;
  format: 'int' | 'comma' | 'cost' | 'percent';
  color?: 'default' | 'clarit' | 'waste' | 'warn';
  suffix?: string;
  onSuffixClick?: () => void;
}) {
  const displayValue =
    format === 'cost'
      ? `$${value.toFixed(4)}`
      : format === 'percent'
        ? `${value}%`
        : format === 'comma'
          ? value.toLocaleString()
          : String(value);

  const colorClass =
    color === 'clarit'
      ? 'text-clarit-600'
      : color === 'waste'
        ? 'text-waste-600'
        : color === 'warn'
          ? 'text-waste-400'
          : 'text-text-primary';

  return (
    <div className="flex flex-col items-center">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <div className="flex items-baseline gap-1">
        <motion.span
          key={displayValue}
          initial={{ y: -4, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`font-mono text-sm font-semibold ${colorClass}`}
        >
          {displayValue}
        </motion.span>
        {suffix && (
          <button
            onClick={onSuffixClick}
            className="text-[9px] text-text-muted hover:text-text-secondary cursor-pointer"
          >
            {suffix}
          </button>
        )}
      </div>
    </div>
  );
}

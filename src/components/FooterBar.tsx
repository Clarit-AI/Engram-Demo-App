import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';

export function FooterBar() {
  const appMode = useDemoStore((s) => s.appMode);

  return (
    <footer
      className="relative flex-none px-4 py-1.5 z-30"
      style={{
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(20px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
        borderTop: '1px solid var(--border-glass)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
      }}
    >
      <div className="flex items-center justify-between text-[11px] text-text-muted max-w-screen-2xl mx-auto font-mono tracking-[0.08em]">
        <span className="font-display font-semibold text-text-secondary tracking-tight uppercase text-[10px]">
          clarit.ai
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            Stateless
            <PulseDot color="var(--burn-500)" />
            <span className="text-burn-600 font-semibold">Live</span>
            <span className="text-text-muted/80">OpenRouter</span>
          </span>
          <span className="flex items-center gap-1.5">
            Stateful
            <PulseDot color="var(--clarit-500)" />
            <span className="text-clarit-600 font-semibold">Simulated</span>
          </span>
          {appMode === 'demo' && (
            <span className="text-signal-700 bg-signal-50/70 border border-signal-200/60 px-1.5 py-0.5 rounded uppercase tracking-[0.14em] text-[9px] font-semibold">
              Demo
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

const PulseDot = memo(function PulseDot({ color }: { color: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: color }}
      animate={
        reduced
          ? {}
          : {
              scale: [1, 1.3, 1],
              opacity: [0.85, 1, 0.85],
            }
      }
      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
});

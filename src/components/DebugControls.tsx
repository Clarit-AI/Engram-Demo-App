import { memo } from 'react';
import { useArcStore } from '../store/arcStore';

export const DebugControls = memo(function DebugControls({ mobile = false }: { mobile?: boolean }) {
  const phase = useArcStore((s) => s.phase);
  const debugHoldStateless = useArcStore((s) => s.debugHoldStateless);
  const setDebugHoldStateless = useArcStore((s) => s.setDebugHoldStateless);
  const setPhase = useArcStore((s) => s.setPhase);

  if (!import.meta.env.DEV || mobile) return null;

  const canReveal = phase === 'peaking';

  return (
    <div className="absolute bottom-24 left-8 z-30 pointer-events-auto">
      <div className="glass-chip-dark flex items-center gap-1.5 rounded-full px-2 py-2 ambient-shadow-dark">
        <span
          className="px-2 font-mono text-[9px] uppercase tracking-[0.18em]"
          style={{ color: 'var(--on-surface-dark-muted)' }}
        >
          Debug
        </span>
        <button
          type="button"
          onClick={() => setDebugHoldStateless(!debugHoldStateless)}
          className="rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] font-semibold transition-colors"
          style={{
            background: debugHoldStateless
              ? 'rgba(0,163,255,0.18)'
              : 'rgba(190,199,212,0.06)',
            color: debugHoldStateless
              ? 'var(--primary-container)'
              : 'var(--on-surface-dark-muted)',
            border: debugHoldStateless
              ? '1px solid rgba(0,163,255,0.32)'
              : '1px solid rgba(190,199,212,0.14)',
          }}
        >
          Hold stateless {debugHoldStateless ? 'on' : 'off'}
        </button>
        <button
          type="button"
          onClick={() => {
            setDebugHoldStateless(false);
            setPhase('revealing');
          }}
          disabled={!canReveal}
          className="rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] font-semibold transition-opacity disabled:opacity-40"
          style={{
            background: 'rgba(104,250,221,0.12)',
            color: 'var(--secondary-container)',
            border: '1px solid rgba(104,250,221,0.28)',
          }}
        >
          Reveal now
        </button>
      </div>
    </div>
  );
});

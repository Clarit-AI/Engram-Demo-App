import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';

interface Particle {
  id: string;
  kind: 'burn' | 'signal';
  /** start x in viewport %, drift left toward the pile */
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  arcH: number; // parabolic arc height
  size: number;
  delay: number;
  duration: number;
}

let particleSeq = 0;

/**
 * TokenFlux — a whisper-thin stream of glyphs flowing from the chat column
 * into the payload pile each time a new turn lands. Communicates waste
 * more viscerally than a percentage.
 *
 * Perf contract:
 *   - Fixed overlay, pointer-events-none.
 *   - Pure DOM nodes (no canvas) on transform/opacity only.
 *   - Cap particle count; auto-prune after animation completes.
 *   - Memoized; completely isolated in its own client leaf.
 *   - Respects prefers-reduced-motion (no emissions).
 */
export const TokenFlux = memo(function TokenFlux() {
  const reduced = useReducedMotion();
  const currentTurn = useDemoStore((s) => s.currentTurn);
  const mode = useDemoStore((s) => s.mode);
  const currentPayloadTokens = useDemoStore((s) => s.currentPayloadTokens);
  const currentNewTokens = useDemoStore((s) => s.currentNewTokens);

  const [particles, setParticles] = useState<Particle[]>([]);
  const lastTurn = useRef(0);

  useEffect(() => {
    if (reduced) return;
    if (currentTurn === lastTurn.current) return;
    if (currentTurn === 0) {
      lastTurn.current = 0;
      return;
    }
    lastTurn.current = currentTurn;

    // Only emit burn (redundant) particles in stateless mode — that's the story.
    const redundant = Math.max(0, currentPayloadTokens - currentNewTokens);
    const burnCount = mode === 'stateless' ? Math.min(Math.ceil(redundant / 90), 14) : 0;
    const signalCount = Math.min(Math.ceil(currentNewTokens / 80), 6);

    const batch: Particle[] = [];
    for (let i = 0; i < burnCount; i += 1) {
      batch.push(makeParticle('burn', i, burnCount));
    }
    for (let i = 0; i < signalCount; i += 1) {
      batch.push(makeParticle('signal', i, signalCount));
    }
    setParticles((prev) => [...prev.slice(-40), ...batch]);
  }, [currentTurn, reduced, mode, currentPayloadTokens, currentNewTokens]);

  const pruneParticle = (id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  };

  if (reduced) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-20 pointer-events-none overflow-hidden"
    >
      <AnimatePresence>
        {particles.map((p) => (
          <FluxParticle key={p.id} p={p} onComplete={() => pruneParticle(p.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
});

function makeParticle(kind: 'burn' | 'signal', i: number, total: number): Particle {
  particleSeq += 1;
  // Source: right-side chat column (roughly 55–75vw)
  const startX = 60 + Math.random() * 18;
  const startY = 18 + Math.random() * 62;
  // Sink: left-side pile (roughly 10–38vw)
  const endX = 12 + Math.random() * 22;
  const endY = 25 + Math.random() * 45;
  return {
    id: `flux-${particleSeq}-${kind}-${i}`,
    kind,
    startX,
    startY,
    endX,
    endY,
    arcH: -6 - Math.random() * 10,
    size: kind === 'burn' ? 3 + Math.random() * 2 : 2 + Math.random() * 1.5,
    delay: (i / Math.max(total - 1, 1)) * 0.35,
    duration: 0.85 + Math.random() * 0.25,
  };
}

function FluxParticle({ p, onComplete }: { p: Particle; onComplete: () => void }) {
  const color =
    p.kind === 'burn'
      ? 'var(--burn-400)'
      : 'var(--signal-400)';
  const glow =
    p.kind === 'burn'
      ? '0 0 8px rgba(232,148,96,0.55)'
      : '0 0 8px rgba(0,163,255,0.55)';

  return (
    <motion.span
      className="absolute rounded-full"
      initial={{
        left: `${p.startX}vw`,
        top: `${p.startY}vh`,
        x: 0,
        y: 0,
        opacity: 0,
        scale: 0.4,
      }}
      animate={{
        left: `${p.endX}vw`,
        top: `${p.endY}vh`,
        y: [0, p.arcH, 0],
        opacity: [0, 1, 0.85, 0],
        scale: [0.4, 1, 0.9, 0.4],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: p.duration,
        delay: p.delay,
        ease: [0.22, 1, 0.36, 1],
        times: [0, 0.25, 0.85, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        width: `${p.size}px`,
        height: `${p.size}px`,
        background: color,
        boxShadow: glow,
        willChange: 'transform, opacity, left, top',
      }}
    />
  );
}

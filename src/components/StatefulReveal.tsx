import { useEffect, useRef, memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';

/**
 * StatefulReveal — overlay that orchestrates the punchline of the demo.
 *
 * Mounts when `phase === 'revealing'` and drives a sequenced choreography
 * of beats by writing to `revealStep` in the store. Other components
 * (ReReadStage, ReReadHUD, ChatPanel) react to each step:
 *
 *   1. flash             — HUD big-number does a scale 1→1.15→1 pulse
 *   2. collapsing        — ReReadStage vacuums the JSON column upward-left
 *   3. sweep             — this overlay renders a 135° gradient band
 *                          sweeping across the viewport
 *   4. chroma            — html.clarity-flash class applied for the RGB
 *                          text-shadow split (240ms)
 *   5. compact-streaming — ReReadStage starts streaming the compact
 *                          {context_id, user} packet
 *   6. badge             — overlay fades in the Manrope display headline
 *                          and the STATEFUL chip
 *   7. finalized         — phase transitions to 'post-arc'
 */
export const StatefulReveal = memo(function StatefulReveal() {
  const reduced = useReducedMotion();
  const phase = useArcStore((s) => s.phase);
  const revealStep = useArcStore((s) => s.revealStep);
  const setRevealStep = useArcStore((s) => s.setRevealStep);
  const setPhase = useArcStore((s) => s.setPhase);

  // Choreography fence — every effect run gets a unique id and only its
  // own timers are allowed to fire. StrictMode and rapid re-renders are
  // tolerated cleanly: superseded runs become no-ops without trying to
  // cancel siblings.
  const runIdRef = useRef(0);
  useEffect(() => {
    if (phase !== 'revealing') {
      // Bump the fence so any in-flight timers from a prior reveal are
      // ignored when they fire.
      runIdRef.current += 1;
      if (revealStep !== 'idle' && phase !== 'post-arc') {
        setRevealStep('idle');
      }
      return;
    }

    runIdRef.current += 1;
    const myRun = runIdRef.current;
    const timers: number[] = [];
    const isCurrent = () => runIdRef.current === myRun;
    const at = (ms: number, fn: () => void) => {
      timers.push(
        window.setTimeout(() => {
          if (isCurrent()) fn();
        }, ms),
      );
    };

    // ---- Choreography (cumulative ms from reveal start) ----
    at(0, () => setRevealStep('flash'));
    at(180, () => setRevealStep('collapsing'));
    at(820, () => setRevealStep('sweep'));
    at(950, () => {
      if (!reduced) {
        document.documentElement.classList.add('clarity-flash');
        timers.push(
          window.setTimeout(() => {
            document.documentElement.classList.remove('clarity-flash');
          }, 260),
        );
      }
      setRevealStep('chroma');
    });
    at(1180, () => setRevealStep('compact-streaming'));
    at(2300, () => setRevealStep('badge'));
    at(4400, () => setRevealStep('finalized'));
    at(4900, () => setPhase('post-arc'));

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      document.documentElement.classList.remove('clarity-flash');
      // We deliberately do NOT clear runIdRef here — the next effect run
      // will increment it and supersede any timers that haven't been
      // cancelled in time (e.g. across StrictMode double-mount).
    };
    // Intentionally omit revealStep, reduced, setRevealStep, setPhase from
    // deps so the effect doesn't re-run during the choreography.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Render only the overlay layers. The vacuum-collapse + compact-packet
  // streaming live inside ReReadStage; here we own everything that floats
  // above both panes.
  if (phase !== 'revealing' && phase !== 'post-arc') return null;

  const showSweep = phase === 'revealing' && (revealStep === 'sweep' || revealStep === 'chroma');
  const showBadge =
    revealStep === 'badge' || revealStep === 'finalized';

  return (
    <>
      {/* Diagonal signature-gradient sweep — slides L→R, mix-blend overlay */}
      <AnimatePresence>
        {showSweep && (
          <motion.div
            key="sweep"
            aria-hidden
            className="fixed inset-0 pointer-events-none z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              initial={{ x: '-110%' }}
              animate={{ x: '110%' }}
              transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-[-30%] w-[160%] -left-[30%]"
              style={{
                transform: 'skewX(-22deg)',
                background:
                  'linear-gradient(135deg, rgba(0,98,157,0) 0%, rgba(0,98,157,0.32) 35%, rgba(0,163,255,0.45) 50%, rgba(0,98,157,0.18) 70%, rgba(0,98,157,0) 100%)',
                mixBlendMode: 'overlay',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manrope display headline — the punchline copy */}
      <AnimatePresence>
        {showBadge && (
          <motion.div
            key="headline"
            className="fixed inset-0 pointer-events-none z-[55] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            aria-hidden
          >
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 26, mass: 0.9 }}
              className="text-center px-8 -mt-32 lg:mr-[40%]"
            >
              <div
                className="font-display text-[clamp(28px,4.6vw,52px)] font-bold tracking-[-0.025em] leading-tight"
                style={{ color: 'var(--on-surface-dark)' }}
              >
                This is all it{' '}
                <span className="sig-gradient-text">needs to read.</span>
              </div>
              <div
                className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em]"
                style={{ color: 'var(--on-surface-dark-muted)' }}
              >
                stateful · clarit.ai engram
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

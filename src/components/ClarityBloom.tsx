import { useEffect, useRef, useState, memo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { bloom } from '../lib/springs';

/**
 * ClarityBloom — the single "click into focus" moment when stateless → stateful.
 *
 * Three coordinated effects fire on mode shift:
 *   1. Radial clarity bloom: a signal-blue gradient expands from screen
 *      center (origin can be tuned), scales to 2.5× and fades out over ~900ms.
 *   2. Chromatic aberration flash: a body-level CSS class applies a brief
 *      RGB text-shadow split on all text, ~180ms easing back to zero.
 *      (The "NZT into focus" cue — no pill, no tunnel.)
 *   3. Store-driven layoutId collapse in CardStack/MessageStacks handles the
 *      pile consolidation automatically via existing spring physics.
 *
 * A11y / perf:
 *   - Respects prefers-reduced-motion (component renders nothing).
 *   - Pointer-events-none, aria-hidden, z-index 60 (above metrics, below modals).
 *   - Memoized; single effect lifecycle listens to mode changes only.
 *   - Chromatic aberration class is scoped to <html> for 180ms and
 *     removed deterministically (no timer leak).
 */
export const ClarityBloom = memo(function ClarityBloom() {
  const reduced = useReducedMotion();
  const mode = useDemoStore((s) => s.mode);
  const [bloomId, setBloomId] = useState<string | null>(null);
  const prevMode = useRef(mode);

  useEffect(() => {
    if (reduced) {
      prevMode.current = mode;
      return;
    }
    // Fire only on stateless → stateful (the narrative moment).
    if (prevMode.current === 'stateless' && mode === 'stateful') {
      const id = `bloom-${Date.now()}`;
      setBloomId(id);

      // Chromatic aberration flash — body-level CSS class, removed after 240ms.
      document.documentElement.classList.add('clarity-flash');
      const flashTimer = window.setTimeout(() => {
        document.documentElement.classList.remove('clarity-flash');
      }, 240);

      return () => {
        window.clearTimeout(flashTimer);
        document.documentElement.classList.remove('clarity-flash');
      };
    }
    prevMode.current = mode;
  }, [mode, reduced]);

  if (reduced) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 60 }}
    >
      <AnimatePresence>
        {bloomId && (
          <>
            {/* Primary bloom ring — soft radial gradient, visible against
                light surfaces without relying on screen-blend tricks. */}
            <motion.div
              key={`${bloomId}-ring`}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: 2.8, opacity: [0, 0.7, 0] }}
              transition={{ duration: 1.0, times: [0, 0.25, 1], ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => setBloomId(null)}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '70vmax',
                height: '70vmax',
                background:
                  'radial-gradient(circle at 50% 50%, rgba(0,163,255,0.55) 0%, rgba(0,163,255,0.22) 28%, rgba(0,71,255,0.10) 48%, rgba(0,71,255,0) 70%)',
                filter: 'blur(2px)',
                willChange: 'transform, opacity',
              }}
            />
            {/* Crisp leading edge — a thin ring that advances ahead of the
                gradient for a "focus snap" sensation, not a glow. */}
            <motion.div
              key={`${bloomId}-edge`}
              initial={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ ...bloom, duration: 1.05 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '20vmax',
                height: '20vmax',
                border: '1.5px solid rgba(0,163,255,0.55)',
                boxShadow:
                  '0 0 24px rgba(0,163,255,0.35), inset 0 0 12px rgba(0,71,255,0.25)',
                willChange: 'transform, opacity',
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
});

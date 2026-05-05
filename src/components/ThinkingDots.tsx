import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * ThinkingDots — the waiting indicator shown in the chat pane while the
 * model is "reading" the prefill. Three signal-blue dots bouncing in a
 * wave. Replaced by the streaming assistant bubble the moment the left-
 * pane JSON crosses the response boundary.
 */
export const ThinkingDots = memo(function ThinkingDots() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <div
        className="rounded-2xl px-5 py-3 ambient-shadow flex items-center gap-1.5"
        style={{
          background: 'var(--surface-container-lowest)',
        }}
        aria-label="Assistant is thinking"
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block w-1.5 h-1.5 rounded-full"
            style={{
              background:
                'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)',
            }}
            animate={
              reduced
                ? { opacity: 0.6 }
                : {
                    y: [0, -4, 0],
                    opacity: [0.35, 1, 0.35],
                  }
            }
            transition={
              reduced
                ? { duration: 0 }
                : {
                    duration: 1.05,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.15,
                  }
            }
          />
        ))}
      </div>
    </motion.div>
  );
});

import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * StreamingCursor — a block-character cursor with a 4 Hz soft pulse.
 * Rendered inline inside the JSON stream at the current write position.
 * Memoized leaf: isolates the continuous motion from the streaming parent
 * so the parent's char emissions don't restart the cursor's animation.
 */
export const StreamingCursor = memo(function StreamingCursor() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="inline-block align-middle"
      style={{
        width: '0.55em',
        height: '1.05em',
        marginLeft: '1px',
        marginBottom: '-2px',
        background: 'var(--primary-container)',
        boxShadow: '0 0 12px rgba(0, 163, 255, 0.55)',
        borderRadius: '1px',
      }}
      animate={
        reduced
          ? { opacity: 0.8 }
          : { opacity: [0.45, 1, 0.45] }
      }
      transition={
        reduced
          ? { duration: 0 }
          : { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
      }
    />
  );
});

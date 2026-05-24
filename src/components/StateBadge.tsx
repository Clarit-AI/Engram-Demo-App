import { motion, useReducedMotion } from 'framer-motion';

/**
 * StateBadge — high-contrast inference mode indicator for both pane subheaders.
 *
 * Agent pane (dark): orange (stateless) or blue (stateful), with a white dot.
 * Human pane (light): gray (stateless) or cyan (stateful), no dot.
 */
export function StateBadge({
  mode,
  pane,
}: {
  mode: 'stateless' | 'stateful';
  pane: 'agent' | 'human';
}) {
  const reducedMotion = useReducedMotion();
  const isStateful = mode === 'stateful';
  const isAgent = pane === 'agent';

  const background = isStateful
    ? '#00A1FF'
    : isAgent
      ? '#E89460'
      : '#8692A6';
  const boxShadow = isAgent && isStateful
    ? '0 0 12px rgba(0,161,255,0.38), inset 0 0 10px rgba(255,255,255,0.12)'
    : isAgent
      ? '0 0 8px rgba(232,148,96,0.28), inset 0 0 8px rgba(255,255,255,0.1)'
      : 'none';

  return (
    <motion.span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[5px] font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-white"
      animate={{ backgroundColor: background, boxShadow }}
      transition={reducedMotion ? { duration: 0 } : { duration: 0.58, ease: [0.32, 0.72, 0, 1] }}
    >
      {pane === 'agent' && (
        <motion.span
          className="block h-[5px] w-[5px] shrink-0 rounded-full bg-white"
          animate={{ opacity: isStateful ? 0.95 : 0.82, scale: isStateful ? 1.08 : 1 }}
          transition={reducedMotion ? { duration: 0 } : { duration: 0.58, ease: [0.32, 0.72, 0, 1] }}
        />
      )}
      {mode}
    </motion.span>
  );
}

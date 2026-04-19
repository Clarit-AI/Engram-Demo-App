import type { Transition } from 'framer-motion';

/**
 * Named spring presets for the Gleaming Prism motion system.
 * Use these everywhere instead of inlining { stiffness, damping, mass }
 * so the whole app has a coherent weight/feel.
 */

/** Clean card entry / exit. Weighty but settled. */
export const cascade: Transition = {
  type: 'spring',
  stiffness: 350,
  damping: 25,
  mass: 1,
};

/** Ghost-layer riffle fan-out. Quick, staggered. */
export const riffle: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 25,
  mass: 0.8,
};

/** Instrument-panel counter flip. Digit columns, precise. */
export const instrument: Transition = {
  type: 'spring',
  stiffness: 260,
  damping: 22,
  mass: 0.6,
};

/** Stateful "click into focus" bloom. Soft expansion. */
export const bloom: Transition = {
  type: 'spring',
  stiffness: 90,
  damping: 18,
  mass: 1.2,
};

/** Mode toggle slider under layoutId. Confident snap. */
export const toggle: Transition = {
  type: 'spring',
  stiffness: 420,
  damping: 32,
  mass: 0.9,
};

/** Pile collapse on stateful switch. Deliberate, heavy. */
export const collapse: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 22,
  mass: 1.4,
};

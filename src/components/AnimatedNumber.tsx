import { useEffect, useState, memo } from 'react';
import { animate, useMotionValue } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Decimal places — 0 for integers, 4 for cost ($0.0183), etc. */
  decimals?: number;
  /** Prefix (e.g., "$") */
  prefix?: string;
  /** Suffix (e.g., "%" or " tok") */
  suffix?: string;
  /** Insert thousands separators */
  comma?: boolean;
  /** Spring config */
  stiffness?: number;
  damping?: number;
  mass?: number;
  /** CSS class for styling */
  className?: string;
  /** Inline style — commonly for gradient-text */
  style?: React.CSSProperties;
}

/**
 * AnimatedNumber — springs a motion value between targets and renders the
 * integer/decimal value each frame. Drop-in for any "big number" HUD slot.
 * Memoized so parent re-renders don't restart the animation.
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  comma = true,
  stiffness = 260,
  damping = 28,
  mass = 0.7,
  className,
  style,
}: AnimatedNumberProps) {
  const mv = useMotionValue(value);
  const [display, setDisplay] = useState(() => format(value, decimals, prefix, suffix, comma));

  // Subscribe to mv changes ONCE (mv is stable across renders; value updates
  // are dispatched via animate() in the separate effect below).
  useEffect(() => {
    const unsub = mv.on('change', (v) => {
      setDisplay(format(v, decimals, prefix, suffix, comma));
    });
    return unsub;
  }, [mv, decimals, prefix, suffix, comma]);

  // Start a new spring each time `value` changes.
  useEffect(() => {
    const controls = animate(mv, value, {
      type: 'spring',
      stiffness,
      damping,
      mass,
    });
    return () => controls.stop();
  }, [value, mv, stiffness, damping, mass]);

  return (
    <span className={className} style={style}>
      {display}
    </span>
  );
});

function format(v: number, decimals: number, prefix: string, suffix: string, comma: boolean): string {
  if (!Number.isFinite(v)) return `${prefix}—${suffix}`;
  const fixed = v.toFixed(decimals);
  if (!comma || decimals > 0) {
    // For decimals, add commas to integer portion only
    const [intPart, decPart] = fixed.split('.');
    const withCommas = comma
      ? Number(intPart).toLocaleString('en-US')
      : intPart;
    return `${prefix}${withCommas}${decPart ? '.' + decPart : ''}${suffix}`;
  }
  return `${prefix}${Number(fixed).toLocaleString('en-US')}${suffix}`;
}

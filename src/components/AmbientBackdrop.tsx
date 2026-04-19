import { memo } from 'react';
import { motion, useReducedMotion, useTime, useTransform } from 'framer-motion';

/**
 * Ambient clinical-lab backdrop.
 *
 * Three soft radial-gradient blobs in the brand signal/depth/clarit hues drift
 * slowly across a fixed, pointer-events-none layer behind the app. A 2% SVG
 * grain overlay sits above the blobs to break up the banding and give the
 * surfaces a subtle film-stock quality (the single Limitless nod at this
 * layer — no pill imagery, no purple glows, no neon).
 *
 * Perf contract:
 *   - `fixed inset-0 z-0 pointer-events-none` — no scroll repaint.
 *   - Animates `transform` and `opacity` only (hardware-accel path).
 *   - Memoized; re-renders only if reduced-motion preference flips.
 *   - Grain SVG is inlined as a data URL (no extra request).
 *
 * A11y:
 *   - `aria-hidden`, decorative only.
 *   - `prefers-reduced-motion: reduce` pins the drift to t=0.
 */
export const AmbientBackdrop = memo(function AmbientBackdrop() {
  const reduced = useReducedMotion();
  const time = useTime();

  // ~0.02 Hz drift → full orbit every ~50s. Amplitude in % units on the
  // blob's transform. Using useTransform keeps the animation off the React
  // render path per the plan's perf rule.
  const driftX1 = useTransform(time, (t) =>
    reduced ? 0 : Math.sin(t / 9000) * 6,
  );
  const driftY1 = useTransform(time, (t) =>
    reduced ? 0 : Math.cos(t / 11000) * 4,
  );
  const driftX2 = useTransform(time, (t) =>
    reduced ? 0 : Math.cos(t / 13000) * 5,
  );
  const driftY2 = useTransform(time, (t) =>
    reduced ? 0 : Math.sin(t / 7500) * 7,
  );
  const driftX3 = useTransform(time, (t) =>
    reduced ? 0 : Math.sin(t / 15000 + 1.2) * 4,
  );
  const driftY3 = useTransform(time, (t) =>
    reduced ? 0 : Math.cos(t / 12500 + 0.6) * 5,
  );

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ contain: 'strict' }}
    >
      {/* Signal blob — top-left */}
      <motion.div
        className="absolute -top-[20%] -left-[15%] h-[70vh] w-[70vh] rounded-full"
        style={{
          x: driftX1,
          y: driftY1,
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,163,255,0.22) 0%, rgba(0,163,255,0.06) 42%, rgba(0,163,255,0) 70%)',
          filter: 'blur(80px)',
          willChange: 'transform',
        }}
      />
      {/* Depth blob — bottom-right */}
      <motion.div
        className="absolute -bottom-[25%] -right-[20%] h-[80vh] w-[80vh] rounded-full"
        style={{
          x: driftX2,
          y: driftY2,
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,71,255,0.18) 0%, rgba(0,71,255,0.05) 45%, rgba(0,71,255,0) 72%)',
          filter: 'blur(90px)',
          willChange: 'transform',
        }}
      />
      {/* Clarit (teal) blob — center, very soft */}
      <motion.div
        className="absolute top-[30%] left-[35%] h-[55vh] w-[55vh] rounded-full"
        style={{
          x: driftX3,
          y: driftY3,
          background:
            'radial-gradient(circle at 50% 50%, rgba(0,191,165,0.14) 0%, rgba(0,191,165,0.04) 50%, rgba(0,191,165,0) 75%)',
          filter: 'blur(70px)',
          willChange: 'transform',
        }}
      />
      {/* 2% grain — high z, pointer-events-none, static (no scroll repaint) */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.04 0 0 0 0 0.07 0 0 0 0 0.13 0 0 0 1 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          backgroundSize: '240px 240px',
        }}
      />
    </div>
  );
});

/**
 * colors.ts — Gleaming Prism heat-tint interpolator.
 *
 * A single cool→warm axis drives the pile's thermal read.
 * As a message gets resent more times, its card warms from
 * signal-blue (cool, efficient) through cyan/green/yellow
 * to desaturated amber (burn — the ceiling at count ≥ 8).
 *
 * Role identity is communicated separately via a left-edge stripe
 * (clarit teal = user, signal blue = assistant), so heat and role
 * stay on independent visual channels.
 */

export interface HeatTint {
  /** Card background — light surface */
  bg: string;
  /** Gradient background — b-from → b-to (top to bottom) */
  bgFrom: string;
  bgTo: string;
  /** Card border */
  border: string;
  /** Strong accent (labels, icons) */
  accent: string;
  /** Shadow color with alpha */
  shadow: string;
  /** Normalized heat [0..1] — useful for additional computed effects */
  heat: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Produce a tint for a card that's appeared in the payload `count` times.
 * count === 1 is the "fresh" (coolest) end; count ≥ 8 saturates at "hot".
 *
 * Interpolates in HSL space from:
 *   cool: hsl(210, 90%, 94%) ≈ signal-100
 *   hot:  hsl(25, 72%, 68%)  ≈ burn-500
 *
 * Hue sweeps 210 → 25 going through cyan/teal/green/yellow on the way
 * (the visually correct cool→warm arc; avoids the purple detour).
 */
export function heatTint(count: number): HeatTint {
  const t = clamp01((count - 1) / 7);

  const h = lerp(210, 25, t);
  const s = lerp(92, 72, t);
  const lBgFrom = lerp(96, 86, t);
  const lBgTo = lerp(90, 72, t);
  const lBorder = lerp(82, 60, t);
  const lAccent = lerp(52, 42, t);
  const lShadow = lerp(60, 50, t);

  return {
    bg: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lBgFrom.toFixed(0)}%)`,
    bgFrom: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lBgFrom.toFixed(0)}%)`,
    bgTo: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lBgTo.toFixed(0)}%)`,
    border: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lBorder.toFixed(0)}%)`,
    accent: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lAccent.toFixed(0)}%)`,
    shadow: `hsl(${h.toFixed(1)}deg ${s.toFixed(0)}% ${lShadow.toFixed(0)}% / 0.28)`,
    heat: t,
  };
}

/**
 * Role identity stripe color.
 * Rendered as a 2-3px left border on message cards so heat-tint remains
 * free to communicate accumulation without fighting role identity.
 */
export function roleStripe(role: 'user' | 'assistant'): string {
  return role === 'user' ? 'var(--clarit-500)' : 'var(--signal-500)';
}

/**
 * Per-ghost-layer heat tint, shifted cooler by layerIndex so ghost layers
 * read as older / more diffuse than the front card.
 */
export function ghostHeat(resendCount: number, layerIndex: number): HeatTint {
  return heatTint(Math.max(1, resendCount - layerIndex * 0.6));
}

import { useEffect, useRef, useState } from 'react';

interface UseStreamTextOptions {
  /** Full target text to stream in. Changing this resets the stream. */
  text: string;
  /**
   * Character offset where the "new" portion begins. Characters before
   * this index emit at `fastRate` (recall). Characters at and after this
   * index emit at `slowRate` (dramatic new content).
   */
  newContentStart: number;
  /** Fast char/sec rate for already-seen content. */
  fastRate: number;
  /** Slow, dramatic char/sec rate for new content. */
  slowRate: number;
  /** When false, the stream is paused (frozen at current position). */
  playing: boolean;
  /** Fires once when the text has fully streamed in. */
  onComplete?: () => void;
  /** When true, the entire text is revealed instantly with no animation. */
  instant?: boolean;
}

interface UseStreamTextResult {
  streamedChars: number;
  isComplete: boolean;
  recallBoundary: number;
}

/** Tick interval for the stream loop in ms (~60fps target). */
const TICK_MS = 16;

/**
 * useStreamText — drives a character-by-character reveal of a target
 * string using setInterval. Variable rate: fast for the "recall" prefix,
 * slow for the "new" suffix. Respects prefers-reduced-motion by
 * completing instantly.
 *
 * Why setInterval instead of rAF: headless / backgrounded browser tabs
 * (e.g. Claude Preview's renderer) throttle requestAnimationFrame to
 * ~0 Hz because the document reports `visibilityState === 'hidden'`.
 * setInterval keeps running regardless and gives identical visual results
 * for the text-streaming use case.
 */
export function useStreamText({
  text,
  newContentStart,
  fastRate,
  slowRate,
  playing,
  onComplete,
  instant = false,
}: UseStreamTextOptions): UseStreamTextResult {
  const [streamedChars, setStreamedChars] = useState(0);

  const pointerRef = useRef(0);
  const lastTickRef = useRef(0);
  const intervalRef = useRef<number | null>(null);
  const firedCompleteRef = useRef(false);
  const completeCbRef = useRef(onComplete);

  useEffect(() => {
    completeCbRef.current = onComplete;
  }, [onComplete]);

  // Reset when target text changes — but ONLY when the new text isn't a
  // forward extension of the prior text. This lets live-streaming callers
  // (Phase 8 chat mode) grow the target as the model emits tokens without
  // restarting the reveal from char 0 each delta.
  const lastTextRef = useRef('');
  useEffect(() => {
    const prior = lastTextRef.current;
    lastTextRef.current = text;
    const isExtension = text.length >= prior.length && text.startsWith(prior);
    if (isExtension) {
      // Text grew (or stayed the same) — keep our place. Just clear the
      // completion flag since there might now be more to stream.
      if (text.length > prior.length) firedCompleteRef.current = false;
      return;
    }
    // Genuine target swap (different turn / different demo) — restart.
    pointerRef.current = 0;
    lastTickRef.current = 0;
    firedCompleteRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- target swaps must reset the streaming cursor synchronously.
    setStreamedChars(0);
  }, [text]);

  // Prefers-reduced-motion or explicit instant → jump to end.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const reduced = !!media?.matches;
    if (reduced || instant) {
      pointerRef.current = text.length;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion intentionally skips the animation frame loop.
      setStreamedChars(text.length);
      if (!firedCompleteRef.current) {
        firedCompleteRef.current = true;
        completeCbRef.current?.();
      }
    }
  }, [text.length, instant]);

  useEffect(() => {
    if (!playing || !text || firedCompleteRef.current) return;

    const tick = () => {
      const now = performance.now();
      if (lastTickRef.current === 0) {
        lastTickRef.current = now;
        return;
      }
      const dt = Math.min((now - lastTickRef.current) / 1000, 0.1);
      lastTickRef.current = now;

      const rate =
        pointerRef.current < newContentStart ? fastRate : slowRate;
      pointerRef.current += rate * dt;

      const clamped = Math.min(pointerRef.current, text.length);
      const flooredInt = Math.floor(clamped);
      setStreamedChars((prev) => (prev === flooredInt ? prev : flooredInt));

      if (clamped >= text.length) {
        if (!firedCompleteRef.current) {
          firedCompleteRef.current = true;
          completeCbRef.current?.();
        }
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    intervalRef.current = window.setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastTickRef.current = 0;
    };
  }, [text, playing, newContentStart, fastRate, slowRate]);

  return {
    streamedChars,
    isComplete: streamedChars >= text.length,
    recallBoundary: newContentStart,
  };
}

/**
 * Find the length of the shared prefix between two strings.
 * Used to compute where a turn's "new" content starts: the divergence
 * point from the prior turn's stringified payload.
 */
export function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) return i;
  }
  return n;
}

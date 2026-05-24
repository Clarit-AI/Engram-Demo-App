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
  // Tracks whether the most recent text change was a forward extension (live
  // token append) vs a genuine swap. Used to decide whether to carry
  // lastTickRef forward in the animation cleanup — extensions should not
  // waste a frame resetting the clock; genuine swaps should start fresh.
  const isExtensionRef = useRef(true);

  const textRef = useRef(text);
  const newContentStartRef = useRef(newContentStart);
  const fastRateRef = useRef(fastRate);
  const slowRateRef = useRef(slowRate);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    newContentStartRef.current = newContentStart;
  }, [newContentStart]);

  useEffect(() => {
    fastRateRef.current = fastRate;
  }, [fastRate]);

  useEffect(() => {
    slowRateRef.current = slowRate;
  }, [slowRate]);

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
    isExtensionRef.current = isExtension;
    if (isExtension) {
      // Text grew (or stayed the same) — keep our place. Just clear the
      // completion flag since there might now be more to stream.
      if (text.length > prior.length) firedCompleteRef.current = false;
      return;
    }
    // Genuine target swap (different turn / different demo) — restart.
    // Reset the tick clock here so the animation effect's cleanup doesn't
    // need to know whether this was a swap or an extension.
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
    if (!playing) return;

    const tick = () => {
      const now = performance.now();
      if (lastTickRef.current === 0) {
        lastTickRef.current = now;
        return;
      }
      const dt = Math.min((now - lastTickRef.current) / 1000, 0.1);
      lastTickRef.current = now;

      const currentText = textRef.current;
      if (pointerRef.current >= currentText.length) {
        return;
      }

      const rate =
        pointerRef.current < newContentStartRef.current ? fastRateRef.current : slowRateRef.current;
      pointerRef.current += rate * dt;

      const clamped = Math.min(pointerRef.current, currentText.length);
      const flooredInt = Math.floor(clamped);
      setStreamedChars((prev) => (prev === flooredInt ? prev : flooredInt));

      if (clamped >= currentText.length) {
        if (!firedCompleteRef.current) {
          firedCompleteRef.current = true;
          completeCbRef.current?.();
        }
      }
    };

    intervalRef.current = window.setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Only reset the tick clock for genuine target swaps. Extensions
      // (live token appends) carry lastTickRef forward so the restarted
      // interval doesn't waste a frame re-recording the timestamp.
      // Genuine swaps already reset lastTickRef in the extension-detection
      // effect above, so we only need to handle the non-extension case here
      // as a safety net (e.g. rate/playing changes while on a genuine turn).
      if (!isExtensionRef.current) {
        lastTickRef.current = 0;
      }
    };
  }, [playing]);

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

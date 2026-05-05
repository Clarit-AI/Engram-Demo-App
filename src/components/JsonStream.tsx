import { useMemo } from 'react';
import { tokenize, TOKEN_COLOR, type Token } from '../lib/jsonTokenizer';
import { StreamingCursor } from './StreamingCursor';

interface JsonStreamProps {
  /** Full pretty-printed JSON text to render. */
  text: string;
  /**
   * Number of characters currently "streamed in" from the start.
   * When === text.length, the cursor is hidden.
   * When < 0, treated as 0.
   * Phase 2: always equal to text.length for static render.
   * Phase 3: animated by useStreamText hook.
   */
  streamedChars?: number;
  /**
   * When true, overrides `streamedChars` and renders the entire payload.
   * Used for the post-reveal compact packet and any "fully landed" state.
   */
  fullyRendered?: boolean;
  /** Hide the pulsing cursor regardless of streaming state. */
  hideCursor?: boolean;
  /**
   * Muted tokens — apply a dim color treatment. Useful for "recall speed"
   * rendering in later phases where prior-turn content appears faster but
   * visually greyed.
   */
  mutedUpTo?: number;
}

/**
 * JsonStream — renders tokenized JSON with per-type syntax colors in a
 * monospace block. Character budget (`streamedChars`) controls how much
 * of the text is revealed; tokens past the budget are clipped. A
 * StreamingCursor sits at the cut point when mid-stream.
 *
 * Rendering strategy: walk tokens, emit <span> runs per token type;
 * for the "cut" token where the budget runs out, emit only the prefix
 * and stop. Preserves correct multi-line layout because whitespace is
 * a first-class token type.
 */
export function JsonStream({
  text,
  streamedChars,
  fullyRendered = false,
  hideCursor = false,
  mutedUpTo = 0,
}: JsonStreamProps) {
  const tokens = useMemo(() => tokenize(text), [text]);

  const budget = fullyRendered
    ? text.length
    : Math.max(0, Math.min(streamedChars ?? text.length, text.length));

  const mutedBudget = Math.max(0, Math.min(mutedUpTo, text.length));

  const showCursor = !hideCursor && !fullyRendered && budget < text.length;

  // Walk tokens and emit clipped pieces.
  const rendered: Array<{ key: string; type: Token['type']; text: string; muted: boolean }> = [];
  let cursorPos = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const end = cursorPos + tok.text.length;

    if (cursorPos >= budget) break;

    if (end <= budget) {
      // Full token fits
      rendered.push({
        key: `${i}-${cursorPos}`,
        type: tok.type,
        text: tok.text,
        muted: end <= mutedBudget,
      });
    } else {
      // Partial token — clip
      const take = budget - cursorPos;
      rendered.push({
        key: `${i}-${cursorPos}-clip`,
        type: tok.type,
        text: tok.text.slice(0, take),
        muted: cursorPos < mutedBudget,
      });
    }
    cursorPos = end;
  }

  return (
    <pre
      className="m-0 font-mono leading-[1.55]"
      style={{
        color: 'var(--on-surface-dark)',
        fontSize: 'inherit',          // inherit from animated parent
        whiteSpace: 'pre-wrap',       // preserve \n AND wrap long lines
        wordBreak: 'break-word',      // break mid-word for unbroken string values
        overflowWrap: 'anywhere',     // belt-and-suspenders for URLs / long tokens
      }}
    >
      {rendered.map((seg) => (
        <span
          key={seg.key}
          style={{
            color: seg.muted
              ? 'var(--on-surface-dark-muted)'
              : TOKEN_COLOR[seg.type],
            opacity: seg.muted ? 0.65 : 1,
          }}
        >
          {seg.text}
        </span>
      ))}
      {showCursor && <StreamingCursor />}
    </pre>
  );
}

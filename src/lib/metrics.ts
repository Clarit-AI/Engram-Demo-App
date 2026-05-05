/**
 * metrics.ts — compute the real numbers that drive the HUD story.
 *
 * "Re-read this turn" is the request payload's token count — what the
 * model has to ingest as input before it can respond. In stateless mode
 * this grows with the full history each turn. That's the whole point.
 *
 * Token estimation uses the standard ~4 chars/token rule for OpenAI-style
 * BPE. We use the payload's stringified length so the number reflects
 * exactly what the viewer is watching stream in (not just message content).
 */

import type { DemoMessage } from '../services/demoLibrary';
import { buildStatelessPayload, stringifyPayload } from './buildPayload';

/** Approximate GPT-BPE chars-per-token ratio. */
const CHARS_PER_TOKEN = 4;

/** Average tokens per printed page of text (~300 words × ~1.3 tokens/word). */
const TOKENS_PER_PAGE = 500;

/**
 * Generic large-LM pricing. ~$2.50 per 1M input tokens is a reasonable
 * mid-market figure for a 70B+ open-weights model served on a cloud API.
 * Can be swapped per-demo/per-model later.
 */
export const DEFAULT_COST_PER_MTOK = 2.5;

export interface TurnMetrics {
  /** Tokens the model must re-read this turn (request payload size). */
  reReadTokens: number;
  /** Rough page-count equivalent of the re-read volume. */
  reReadPages: number;
  /** Cost of this single turn's input processing, in USD. */
  turnCostUsd: number;
}

export interface SessionMetrics {
  /** Cumulative tokens re-processed across all turns played so far. */
  totalTokens: number;
  /** Cumulative USD spent on input-side processing. */
  totalCostUsd: number;
  /** Cumulative page-count equivalent across the session. */
  totalPages: number;
}

/** Fast estimator — approximate tokens from raw char length. */
export function estimateTokensFromChars(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Compute metrics for one specific turn's stateless payload. */
export function computeTurnMetrics(
  messages: DemoMessage[],
  model: string,
  turn: number,
  costPerMTok: number = DEFAULT_COST_PER_MTOK,
): TurnMetrics {
  const payload = buildStatelessPayload(messages, model, turn);
  const chars = stringifyPayload(payload).length;
  const tokens = estimateTokensFromChars(chars);
  return {
    reReadTokens: tokens,
    reReadPages: tokens / TOKENS_PER_PAGE,
    turnCostUsd: (tokens / 1_000_000) * costPerMTok,
  };
}

/**
 * Compute cumulative session metrics for all turns from 1 through `upToTurn`
 * (inclusive).
 */
export function computeSessionMetrics(
  messages: DemoMessage[],
  model: string,
  upToTurn: number,
  costPerMTok: number = DEFAULT_COST_PER_MTOK,
): SessionMetrics {
  let totalTokens = 0;
  for (let t = 1; t <= upToTurn; t++) {
    const m = computeTurnMetrics(messages, model, t, costPerMTok);
    totalTokens += m.reReadTokens;
  }
  return {
    totalTokens,
    totalCostUsd: (totalTokens / 1_000_000) * costPerMTok,
    totalPages: totalTokens / TOKENS_PER_PAGE,
  };
}

/**
 * Compact stateful equivalent — used for the reveal. Shows what the same
 * turn's input WOULD be if the model could restore snapshot state.
 * For the punchline we approximate: context_id + the latest user msg only.
 */
export function computeStatefulTurnMetrics(
  messages: DemoMessage[],
  _model: string,
  turn: number,
  costPerMTok: number = DEFAULT_COST_PER_MTOK,
): TurnMetrics {
  const convo = messages.filter((m) => m.role !== 'system');
  const userTurns = convo.filter((m) => m.role === 'user');
  const userContent = userTurns[turn - 1]?.content ?? '';
  // context_id line + structural wrap ≈ 70 chars fixed overhead
  const chars = userContent.length + 70;
  const tokens = estimateTokensFromChars(chars);
  return {
    reReadTokens: tokens,
    reReadPages: tokens / TOKENS_PER_PAGE,
    turnCostUsd: (tokens / 1_000_000) * costPerMTok,
  };
}

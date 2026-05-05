/**
 * buildPayload.ts
 *
 * Given a DemoMeta and a turn index, construct the exact wire payload the
 * app would send for that turn in stateless mode. This is the JSON the
 * left-pane Re-Read stage renders.
 *
 * Turn indexing (1-based):
 *   Turn 1 → payload = [system?, user_1]
 *   Turn 2 → payload = [system?, user_1, asst_1, user_2]
 *   Turn N → payload = [system?, user_1, asst_1, ..., user_{N-1}, asst_{N-1}, user_N]
 *
 * Post-turn (after the assistant responds), the stored conversation
 * includes asst_N as well. We don't render that in the stateless request
 * because it's not in the wire payload — the response was what came back.
 *
 * For the stateful reveal, the payload becomes a compact packet:
 *   [system?, { role: "meta", context_id, turn }, user_N]
 * handled separately.
 */

import type { DemoMessage } from '../services/demoLibrary';

export interface WirePayload {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Build the stateless wire payload for a given turn of a demo.
 */
export function buildStatelessPayload(
  messages: DemoMessage[],
  model: string,
  turn: number,
): WirePayload {
  if (turn < 1) {
    throw new Error(`buildStatelessPayload: turn must be >= 1 (got ${turn})`);
  }

  const sys = messages.filter((m) => m.role === 'system');
  const convo = messages.filter((m) => m.role !== 'system');

  // For turn N, we include (N-1) prior pairs + user_N.
  // Conversation indices are user_0, asst_0, user_1, asst_1, ...
  // Take indices 0..(2N-2) inclusive → slice(0, 2N-1) → 2N-1 messages.
  const sliceEnd = 2 * turn - 1;
  const slice = convo.slice(0, sliceEnd);

  const wire: WirePayload['messages'] = [
    ...sys.map((m) => ({ role: m.role, content: m.content })),
    ...slice.map((m) => ({ role: m.role, content: m.content })),
  ];

  return {
    model,
    messages: wire,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
  };
}

/**
 * Build the stateful "compact packet" payload for the reveal moment.
 * This is the punchline shape — a context_id pointer + only the new msg.
 */
export function buildStatefulPayload(
  messages: DemoMessage[],
  model: string,
  turn: number,
  contextId: string,
): WirePayload {
  const sys = messages.filter((m) => m.role === 'system');
  const convo = messages.filter((m) => m.role !== 'system');
  const userTurns = convo.filter((m) => m.role === 'user');
  const currentUser = userTurns[turn - 1];

  const wire: WirePayload['messages'] = [
    ...sys.map((m) => ({ role: m.role, content: m.content })),
    ...(currentUser
      ? [{ role: 'user', content: currentUser.content }]
      : []),
  ];

  return {
    model,
    messages: wire,
    stream: true,
    temperature: 0.7,
    max_tokens: 2048,
    // In the real Engram integration this maps to providerOptions.clarit.conversationId.
    // For render purposes we include it as a top-level field so it shows in the JSON.
    // @ts-expect-error — augment for display
    context_id: contextId,
  };
}

/**
 * Stringify a payload for rendering. 2-space indent for a tidy,
 * eye-scanable tree; no trailing whitespace.
 */
export function stringifyPayload(payload: WirePayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Delimiter between request payload and streamed response section. */
export const RESPONSE_DELIMITER = '\n\n// ← generating response\n\n';

/** Build the JSON entry shape for an assistant response. */
export function stringifyAssistantEntry(content: string): string {
  return JSON.stringify({ role: 'assistant', content }, null, 2);
}

/**
 * Compose the full text the left pane renders for a turn:
 * requestPayload + delimiter + assistant response entry.
 * Returns `{ fullText, responseBoundary }` — the boundary is the char
 * index where the delimiter+response section begins (where thinking-dots
 * on the chat pane should swap for a streaming bubble).
 */
export function composeTurnStreamText(
  requestText: string,
  responseContent: string,
): { fullText: string; responseBoundary: number; responseStart: number } {
  const responseEntry = stringifyAssistantEntry(responseContent);
  return {
    fullText: requestText + RESPONSE_DELIMITER + responseEntry,
    // responseBoundary is the point at which the chat bubble first appears
    // (right after the delimiter ends, so the user has seen the "// ←
    // generating response" marker)
    responseBoundary: requestText.length + RESPONSE_DELIMITER.length,
    responseStart: requestText.length + RESPONSE_DELIMITER.length,
  };
}

/**
 * Build the compact-packet text shown in the stateful reveal.
 * The punchline JSON: a tiny 4-line context_id + user pointer.
 * Streamed in after the vacuum-collapse to drive the contrast home.
 */
export function buildCompactPacketText(userMessage: string, conversationId: string): string {
  const packet = {
    context_id: conversationId,
    user: userMessage,
  };
  return JSON.stringify(packet, null, 2);
}

/** Generate a plausible Engram-style context_id for the compact packet display. */
export function makeContextId(seed: string): string {
  // Stable hash from the seed → hex-ish suffix
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
  return `ctx_${hex}`;
}

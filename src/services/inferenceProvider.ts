/**
 * inferenceProvider.ts
 *
 * Phase 8 — Live Vercel AI SDK wiring.
 *
 * Two modes share one streaming interface:
 *
 *   - **Stateless (OpenRouter)** — full conversation history sent on every
 *     turn. Mirrors what the dramatization on the left pane is showing.
 *   - **Stateful (Engram stub)** — sends only the latest user message
 *     plus a `contextId`. Today this is a stub that calls the same
 *     OpenRouter endpoint with the full history but reports the wire
 *     payload as the compact `{context_id, user}` shape so the UI can
 *     truthfully show the post-reveal post-arc behavior. When the real
 *     `@clarit.ai/vercel-ai-provider` is installed, swap the stub to it
 *     with `compatibilityMode: 'append-only'` and the rest of the app
 *     works unchanged.
 *
 * The Vercel AI SDK (`ai` + `@ai-sdk/openai`) is already in
 * package.json; OpenRouter is OpenAI-API-compatible so we point the
 * provider at OpenRouter's baseURL.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import type { ChatTurnMessage } from '../store/chatStore';

export interface WirePayload {
  /** Tagged so the JSON renderer can syntax-highlight identically to demo turns */
  body: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    stream: true;
    /** Only present in stateful mode */
    context_id?: string;
  };
}

export interface StreamHandle {
  /** Async iterable of text deltas from the model */
  textStream: AsyncIterable<string>;
  /** Resolves to the full assembled response text */
  fullText: Promise<string>;
}

export interface InferenceProvider {
  readonly mode: 'stateless' | 'stateful';
  /**
   * Build the wire-shape payload for a turn (the JSON the dramatization
   * will re-stream). Stateless = full history; stateful = compact pointer.
   */
  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload;
  /**
   * Open a streaming completion. The `messages` arg is always the full
   * canonical history — the provider is responsible for collapsing it
   * to its actual wire shape before calling the model.
   */
  stream(messages: ChatTurnMessage[], model: string): StreamHandle;
  abort(): void;
}

/**
 * Get a configured OpenAI-compatible client pointed at OpenRouter.
 * Throws if `VITE_OPENROUTER_API_KEY` is missing — the UI surfaces this.
 */
function getOpenRouterClient() {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const baseURL =
    import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  if (!apiKey) {
    throw new Error(
      'Missing VITE_OPENROUTER_API_KEY — set it in .env.local before using live chat.',
    );
  }
  return createOpenAI({
    apiKey,
    baseURL,
    // OpenRouter recommends these headers for analytics/attribution
    headers: {
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      'X-Title': 'clarit.ai demo-chat-v2',
    },
  });
}

class StatelessProvider implements InferenceProvider {
  readonly mode = 'stateless' as const;
  private aborter: AbortController | null = null;

  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload {
    return {
      body: {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      },
    };
  }

  stream(messages: ChatTurnMessage[], model: string): StreamHandle {
    this.aborter?.abort();
    this.aborter = new AbortController();

    const client = getOpenRouterClient();
    const result = streamText({
      model: client(model),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      abortSignal: this.aborter.signal,
    });

    return {
      textStream: result.textStream,
      fullText: result.text,
    };
  }

  abort() {
    this.aborter?.abort();
    this.aborter = null;
  }
}

/**
 * Stateful stub. Today: calls OpenRouter with the full conversation
 * (since we don't have a real Engram endpoint to hit). Reports a compact
 * wire payload so the UI tells the post-reveal truth.
 *
 * Replacement seam for production:
 *
 *   import { createEngram } from '@clarit.ai/vercel-ai-provider';
 *   const client = createEngram({
 *     apiKey: import.meta.env.VITE_ENGRAM_API_KEY,
 *     compatibilityMode: 'append-only',
 *   });
 *   const result = streamText({ model: client(model), messages: [{ role: 'user', content: latest }], ... });
 */
class StatefulStubProvider implements InferenceProvider {
  readonly mode = 'stateful' as const;
  private aborter: AbortController | null = null;
  /** Once a context_id is minted for this session, it stays stable */
  private contextId: string | null = null;

  private ensureContextId(seed: string): string {
    if (this.contextId) return this.contextId;
    // Deterministic-ish 8-char hex from a string seed
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    this.contextId = `ctx_${(h >>> 0).toString(16).padStart(8, '0')}`;
    return this.contextId;
  }

  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload {
    const ctxId = this.ensureContextId(model + ':' + (messages[0]?.content ?? ''));
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return {
      body: {
        model,
        // Stateful wire: only the latest user message goes over the wire;
        // server reconstructs context from `context_id`.
        messages: lastUser
          ? [{ role: 'user', content: lastUser.content }]
          : [],
        stream: true,
        context_id: ctxId,
      },
    };
  }

  stream(messages: ChatTurnMessage[], model: string): StreamHandle {
    this.aborter?.abort();
    this.aborter = new AbortController();

    // Stub: still send full history to OpenRouter so the model has context.
    // The user-facing wire payload (above) tells the truth about what
    // Engram would actually transmit.
    const client = getOpenRouterClient();
    const result = streamText({
      model: client(model),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      abortSignal: this.aborter.signal,
    });

    return {
      textStream: result.textStream,
      fullText: result.text,
    };
  }

  abort() {
    this.aborter?.abort();
    this.aborter = null;
  }
}

const stateless = new StatelessProvider();
const stateful = new StatefulStubProvider();

export function getInferenceProvider(mode: 'stateless' | 'stateful'): InferenceProvider {
  return mode === 'stateful' ? stateful : stateless;
}

/**
 * Pretty-print a wire payload to the same JSON format the demo
 * dramatization uses.
 */
export function stringifyWirePayload(p: WirePayload): string {
  return JSON.stringify(p.body, null, 2);
}

export const DEFAULT_LIVE_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct:free';

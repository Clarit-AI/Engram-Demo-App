import type { ChatTurnMessage } from '../store/chatStore';
import type {
  ChatProviderMetadata,
  ProviderMode,
} from '../server/types';

export interface WirePayload {
  body: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    stream: true;
    context_id?: string;
    provider_mode?: ProviderMode;
  };
}

export interface StreamHandle {
  textStream: AsyncIterable<string>;
  fullText: Promise<string>;
  metadata: Promise<ChatProviderMetadata | null>;
}

export interface InferenceProvider {
  readonly mode: 'stateless' | 'stateful';
  readonly providerMode: ProviderMode;
  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload;
  stream(messages: ChatTurnMessage[], model: string, turnNumber?: number): StreamHandle;
  abort(): void;
}

const CHAT_API_URL = import.meta.env.VITE_CHAT_API_URL || '/api/chat';
const STATEFUL_PROVIDER_MODE = normalizeStatefulProviderMode(
  import.meta.env.VITE_STATEFUL_PROVIDER_MODE,
);

export const DEFAULT_LIVE_MODEL =
  import.meta.env.VITE_DEFAULT_MODEL || 'nvidia/nemotron-3-super-120b-a12b';

function normalizeStatefulProviderMode(value: unknown): ProviderMode {
  return value === 'stateful-engram' ? 'stateful-engram' : 'simulated-engram';
}

function mkContextId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return `ctx_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function normalizeMessages(messages: ChatTurnMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
  }));
}

function parseSseEvent(raw: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

function streamFromApi(
  request: {
    mode: ProviderMode;
    messages: ReturnType<typeof normalizeMessages>;
    model: string;
    conversationId?: string;
    turnNumber?: number;
  },
  aborter: AbortController,
): StreamHandle {
  let resolveFull!: (value: string) => void;
  let rejectFull!: (reason?: unknown) => void;
  const fullText = new Promise<string>((resolve, reject) => {
    resolveFull = resolve;
    rejectFull = reject;
  });

  let resolveMetadata!: (value: ChatProviderMetadata | null) => void;
  const metadata = new Promise<ChatProviderMetadata | null>((resolve) => {
    resolveMetadata = resolve;
  });

  const textStream = (async function* () {
    let assembled = '';
    let finalMetadata: ChatProviderMetadata | null = null;

    try {
      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: aborter.signal,
      });

      if (!response.ok) {
        let message = `Chat API failed with ${response.status}.`;
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the status-based message.
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error('Chat API did not return a response stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const parsed = parseSseEvent(chunk);
          if (!parsed) continue;

          if (parsed.event === 'metadata' || parsed.event === 'done') {
            finalMetadata = parsed.data as ChatProviderMetadata;
            if (parsed.event === 'done') resolveMetadata(finalMetadata);
          } else if (parsed.event === 'delta') {
            const data = parsed.data as { text?: string };
            if (typeof data.text === 'string') {
              assembled += data.text;
              yield data.text;
            }
          } else if (parsed.event === 'error') {
            const data = parsed.data as { message?: string };
            throw new Error(data.message || 'Chat API stream failed.');
          }
        }
      }

      resolveMetadata(finalMetadata);
      resolveFull(assembled);
    } catch (error) {
      resolveMetadata(finalMetadata);
      rejectFull(error);
      throw error;
    }
  })();

  return { textStream, fullText, metadata };
}

class StatelessProvider implements InferenceProvider {
  readonly mode = 'stateless' as const;
  readonly providerMode = 'stateless-openrouter' as const;
  private aborter: AbortController | null = null;

  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload {
    return {
      body: {
        model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: true,
        provider_mode: this.providerMode,
      },
    };
  }

  stream(messages: ChatTurnMessage[], model: string, turnNumber?: number): StreamHandle {
    this.aborter?.abort();
    this.aborter = new AbortController();
    return streamFromApi(
      {
        mode: this.providerMode,
        messages: normalizeMessages(messages),
        model,
        turnNumber,
      },
      this.aborter,
    );
  }

  abort() {
    this.aborter?.abort();
    this.aborter = null;
  }
}

class StatefulProvider implements InferenceProvider {
  readonly mode = 'stateful' as const;
  readonly providerMode = STATEFUL_PROVIDER_MODE;
  private aborter: AbortController | null = null;
  private contextId: string | null = null;

  private ensureContextId(seed: string): string {
    if (this.contextId) return this.contextId;
    this.contextId = mkContextId(seed);
    return this.contextId;
  }

  buildWirePayload(messages: ChatTurnMessage[], model: string): WirePayload {
    const contextId = this.ensureContextId(model + ':' + (messages[0]?.content ?? ''));
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    return {
      body: {
        model,
        messages: lastUser
          ? [{ role: 'user', content: lastUser.content }]
          : [],
        stream: true,
        context_id: contextId,
        provider_mode: this.providerMode,
      },
    };
  }

  stream(messages: ChatTurnMessage[], model: string, turnNumber?: number): StreamHandle {
    this.aborter?.abort();
    this.aborter = new AbortController();
    const contextId = this.ensureContextId(model + ':' + (messages[0]?.content ?? ''));
    return streamFromApi(
      {
        mode: this.providerMode,
        messages: normalizeMessages(messages),
        model,
        conversationId: contextId,
        turnNumber,
      },
      this.aborter,
    );
  }

  abort() {
    this.aborter?.abort();
    this.aborter = null;
  }
}

const stateless = new StatelessProvider();
const stateful = new StatefulProvider();

export function getInferenceProvider(mode: 'stateless' | 'stateful'): InferenceProvider {
  return mode === 'stateful' ? stateful : stateless;
}

export function stringifyWirePayload(p: WirePayload): string {
  return JSON.stringify(p.body, null, 2);
}

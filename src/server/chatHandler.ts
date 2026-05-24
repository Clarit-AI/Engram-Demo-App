import { getDefaultProviderMode, normalizeProviderMode } from './env';
import {
  extractEngramMetadata,
  prepareChatStream,
} from './chatProviders';
import { reserveChatCapacity } from './session';
import type { ProviderMetadata } from 'ai';
import type {
  ChatMessageInput,
  ChatProviderMetadata,
  ChatRequestBody,
  ChatServerEnv,
  ChatSseError,
} from './types';

const encoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function jsonResponseWithHeaders(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizeMessages(value: unknown): ChatMessageInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ChatMessageInput | null => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      const role = candidate.role;
      const content = candidate.content;
      if (
        (role !== 'system' && role !== 'user' && role !== 'assistant') ||
        typeof content !== 'string'
      ) {
        return null;
      }
      return {
        id: typeof candidate.id === 'string' ? candidate.id : undefined,
        role,
        content,
      };
    })
    .filter((message): message is ChatMessageInput => message !== null);
}

async function parseBody(request: Request): Promise<ChatRequestBody> {
  if (request.headers.get('content-type')?.includes('application/json') !== true) {
    throw new Error('POST /api/chat requires application/json.');
  }

  const raw = (await request.json()) as ChatRequestBody;
  return {
    ...raw,
    messages: normalizeMessages(raw.messages),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeFinalMetadata(
  metadata: ChatProviderMetadata,
  providerMetadata: ProviderMetadata | undefined,
): ChatProviderMetadata {
  const finalMetadata = { ...metadata };
  const engram = extractEngramMetadata(providerMetadata);
  if (engram) {
    finalMetadata.engram = {
      ...metadata.engram,
      ...engram,
    };
  }
  return finalMetadata;
}

export async function handleChatRequest(
  request: Request,
  env: ChatServerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.get('origin') || '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: `Unsupported method for ${url.pathname}.` }, 405);
  }

  let body: ChatRequestBody;
  try {
    body = await parseBody(request);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 400);
  }

  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return jsonResponse({ error: 'Request must include at least one chat message.' }, 400);
  }

  const providerMode = normalizeProviderMode(body.mode, getDefaultProviderMode(env));
  const capacity = await reserveChatCapacity(request, env, body, messages);
  if (!capacity.ok) {
    return jsonResponseWithHeaders(capacity.body, capacity.status, {
      ...capacity.headers,
      'access-control-allow-origin': request.headers.get('origin') || '*',
      'access-control-allow-credentials': 'true',
    });
  }

  let prepared: ReturnType<typeof prepareChatStream>;
  try {
    prepared = prepareChatStream(providerMode, body, messages, env, request);
    prepared.metadata = {
      ...prepared.metadata,
      session: {
        idPreview: capacity.session.id.slice(0, 8),
        active: true,
        createdAt: new Date(capacity.session.createdAt).toISOString(),
        lastSeen: new Date(capacity.session.lastSeen).toISOString(),
        expiresAt: new Date(capacity.session.expiresAt).toISOString(),
        inFlight: capacity.session.inFlight,
        requestsThisMinute: capacity.session.requestTimestamps.length,
      },
      rateLimit: capacity.metadata,
    };
  } catch (error) {
    capacity.release();
    return jsonResponseWithHeaders(
      { error: errorMessage(error), providerMode },
      500,
      {
        ...capacity.headers,
        'access-control-allow-origin': request.headers.get('origin') || '*',
        'access-control-allow-credentials': 'true',
      },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(sse('metadata', prepared.metadata));

      try {
        for await (const text of prepared.textStream) {
          controller.enqueue(sse('delta', { text }));
        }

        const providerMetadata = await prepared.providerMetadata;
        controller.enqueue(sse('done', makeFinalMetadata(prepared.metadata, providerMetadata)));
        controller.close();
      } catch (error) {
        const payload: ChatSseError = { message: errorMessage(error) };
        controller.enqueue(sse('error', payload));
        controller.close();
      } finally {
        capacity.release();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-clarit-provider-mode': providerMode,
      ...capacity.headers,
      'access-control-allow-origin': request.headers.get('origin') || '*',
      'access-control-allow-credentials': 'true',
    },
  });
}

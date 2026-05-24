import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createClarit } from '@clarit.ai/vercel-ai-provider';
import { streamText } from 'ai';
import type { ProviderMetadata } from 'ai';
import {
  getEngramModel,
  getNvidiaNimModel,
  getOpenRouterModel,
  getStatelessProvider,
  makeConversationId,
  NVIDIA_NIM_BASE_URL_DEFAULT,
  OPENROUTER_BASE_URL_DEFAULT,
} from './env';
import type {
  ChatMessageInput,
  ChatProviderMetadata,
  ChatRequestBody,
  ChatServerEnv,
  ProviderMode,
} from './types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { StatelessProviderName } from './env';
import { getEngramHealth, recordEngramSuccess, recordEngramFailure } from './engramHealth';

export interface PreparedChatStream {
  textStream: AsyncIterable<string>;
  providerMetadata: PromiseLike<ProviderMetadata | undefined>;
  metadata: ChatProviderMetadata;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function estimateMessagesTokens(messages: ChatMessageInput[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

function loadEngramSystemPrompt(): string {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(dir, 'prompts.json'), 'utf8');
    const config = JSON.parse(raw) as { engram?: { systemPrompt?: string } };
    const prompt = config.engram?.systemPrompt;
    if (typeof prompt === 'string' && prompt.length > 0) return prompt;
  } catch {
    // fall through to default
  }
  return (
    'You are a helpful AI assistant. Respond directly and concisely. ' +
    'Do not narrate your reasoning process, restate the question, or explain what you are about to do. ' +
    'Just answer.'
  );
}

const ENGRAM_SYSTEM_PROMPT = loadEngramSystemPrompt();

function withEngramSystemPrompt(messages: ChatMessageInput[]): ChatMessageInput[] {
  if (messages.some((m) => m.role === 'system')) return messages;
  return [{ role: 'system', content: ENGRAM_SYSTEM_PROMPT }, ...messages];
}

function latestUserOnly(messages: ChatMessageInput[]): ChatMessageInput[] {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const latestUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!latestUser) return [];
  return [...systemMessages, { role: 'user', content: latestUser.content }];
}

function createOpenRouterClient(env: ChatServerEnv, origin: string) {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY on the server.');
  }

  return createOpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL_DEFAULT,
    headers: {
      'HTTP-Referer': origin,
      'X-Title': 'clarit.ai demo-chat-v2',
    },
  });
}

function createNvidiaNimClient(env: ChatServerEnv) {
  if (!env.NVIDIA_NIM_API_KEY) {
    throw new Error('Missing NVIDIA_NIM_API_KEY on the server.');
  }

  return createOpenAICompatible({
    name: 'nvidia-nim',
    apiKey: env.NVIDIA_NIM_API_KEY,
    baseURL: env.NVIDIA_NIM_BASE_URL || NVIDIA_NIM_BASE_URL_DEFAULT,
  });
}

function getConversationId(body: ChatRequestBody, messages: ChatMessageInput[]): string {
  return (
    body.conversationId ||
    makeConversationId(messages.map((message) => `${message.role}:${message.content}`).join('\n'))
  );
}

function buildBaseMetadata(
  providerMode: ProviderMode,
  model: string,
  body: ChatRequestBody,
  messages: ChatMessageInput[],
  sentMessages: ChatMessageInput[],
  requestShape: ChatProviderMetadata['requestShape'],
  statelessProvider?: StatelessProviderName,
): ChatProviderMetadata {
  const conversationId =
    providerMode === 'stateless-openrouter' ? undefined : getConversationId(body, messages);

  return {
    providerMode,
    statelessProvider,
    model,
    conversationId,
    turnNumber: body.turnNumber,
    requestShape,
    sentMessageCount: sentMessages.length,
    canonicalMessageCount: messages.length,
    estimatedInputTokens: estimateMessagesTokens(sentMessages),
  };
}

function prepareStatelessProviderStream(
  statelessProvider: StatelessProviderName,
  body: ChatRequestBody,
  messages: ChatMessageInput[],
  env: ChatServerEnv,
  request: Request,
) {
  const origin = request.headers.get('origin') || new URL(request.url).origin;

  if (statelessProvider === 'nvidia-nim') {
    const model = getNvidiaNimModel(env, body.model);
    const nim = createNvidiaNimClient(env);
    return {
      model,
      result: streamText({
        model: nim.chatModel(model),
        messages,
        abortSignal: request.signal,
      }),
    };
  }

  const model = getOpenRouterModel(env, body.model);
  const openrouter = createOpenRouterClient(env, origin);
  return {
    model,
    result: streamText({
      model: openrouter(model),
      messages,
      abortSignal: request.signal,
    }),
  };
}

export function extractEngramMetadata(
  providerMetadata: ProviderMetadata | undefined,
): ChatProviderMetadata['engram'] | undefined {
  const clarit = providerMetadata?.clarit;
  if (!clarit || typeof clarit !== 'object') return undefined;

  const data = clarit as Record<string, unknown>;
  return {
    compatibilityResult:
      typeof data.compatibilityResult === 'string' ? data.compatibilityResult : undefined,
    fallbackReason: typeof data.fallbackReason === 'string' ? data.fallbackReason : undefined,
    snapshotSaved: typeof data.snapshotSaved === 'boolean' ? data.snapshotSaved : undefined,
    snapshotId: typeof data.snapshotId === 'string' ? data.snapshotId : undefined,
    reusedTokenCount:
      typeof data.reusedTokenCount === 'number' ? data.reusedTokenCount : undefined,
    continuationTokenCount:
      typeof data.continuationTokenCount === 'number'
        ? data.continuationTokenCount
        : undefined,
    restoreLatencyMs:
      typeof data.restoreLatencyMs === 'number'
        ? data.restoreLatencyMs
        : typeof data.restore_latency_ms === 'number'
          ? data.restore_latency_ms
          : undefined,
    snapshotSizeBytes:
      typeof data.snapshotSizeBytes === 'number'
        ? data.snapshotSizeBytes
        : typeof data.snapshot_size_bytes === 'number'
          ? data.snapshot_size_bytes
          : undefined,
    snapshotSizeMb:
      typeof data.snapshotSizeMb === 'number'
        ? data.snapshotSizeMb
        : typeof data.snapshot_size_mb === 'number'
          ? data.snapshot_size_mb
          : undefined,
  };
}

async function* watchedStream(src: AsyncIterable<string>): AsyncIterable<string> {
  let gotChunk = false;
  try {
    for await (const chunk of src) {
      if (!gotChunk) {
        recordEngramSuccess();
        gotChunk = true;
      }
      yield chunk;
    }
    if (!gotChunk) recordEngramSuccess();
  } catch (err) {
    recordEngramFailure();
    throw err;
  }
}

export function prepareChatStream(
  providerMode: ProviderMode,
  body: ChatRequestBody,
  messages: ChatMessageInput[],
  env: ChatServerEnv,
  request: Request,
): PreparedChatStream {
  let effectiveMode: ProviderMode = providerMode;

  if (providerMode === 'stateful-engram') {
    if (!env.ENGRAM_BASE_URL) {
      throw new Error('Missing ENGRAM_BASE_URL on the server.');
    }

    const { status } = getEngramHealth();

    if (status !== 'offline') {
      const sentMessages = withEngramSystemPrompt(latestUserOnly(messages));
      const model = getEngramModel(env, body.model);
      const conversationId = getConversationId(body, messages);
      const clarit = createClarit({
        baseURL: env.ENGRAM_BASE_URL,
        apiKey: env.ENGRAM_API_KEY,
        adminApiKey: env.ENGRAM_ADMIN_API_KEY,
      });

      const result = streamText({
        model: clarit(model),
        messages: sentMessages,
        abortSignal: request.signal,
        providerOptions: {
          clarit: {
            conversationId,
            turnNumber: body.turnNumber,
            autoSaveSnapshot: true,
          },
        },
      });

      return {
        textStream: watchedStream(result.textStream),
        providerMetadata: result.providerMetadata,
        metadata: buildBaseMetadata(
          providerMode,
          model,
          { ...body, conversationId },
          messages,
          sentMessages,
          'engram-delta',
        ),
      };
    }

    // Engram is offline — fall through to simulated-engram
    effectiveMode = 'simulated-engram';
  }

  const statelessProvider = getStatelessProvider(env);
  const { model, result } = prepareStatelessProviderStream(
    statelessProvider,
    body,
    messages,
    env,
    request,
  );

  const metadataMessages = effectiveMode === 'simulated-engram'
    ? latestUserOnly(messages)
    : messages;

  const metadata = buildBaseMetadata(
    effectiveMode,
    model,
    body,
    messages,
    metadataMessages,
    effectiveMode === 'simulated-engram' ? 'engram-delta' : 'full-history',
    statelessProvider,
  );

  if (effectiveMode === 'simulated-engram') {
    metadata.conversationId = getConversationId(body, messages);
    metadata.engram = { simulated: true, compatibilityResult: 'simulated' };
    if (providerMode === 'stateful-engram') {
      metadata.engram = { ...metadata.engram, fallback: true, fallbackReason: 'engram-offline' };
    }
  }

  return {
    textStream: result.textStream,
    providerMetadata: result.providerMetadata,
    metadata,
  };
}
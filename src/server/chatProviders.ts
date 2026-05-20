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
import type { StatelessProviderName } from './env';

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

function latestUserOnly(messages: ChatMessageInput[]): ChatMessageInput[] {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUser) return [];

  const firstSystem = messages.find((message) => message.role === 'system');
  return firstSystem
    ? [
        { role: 'system', content: firstSystem.content },
        { role: 'user', content: latestUser.content },
      ]
    : [{ role: 'user', content: latestUser.content }];
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
  };
}

export function prepareChatStream(
  providerMode: ProviderMode,
  body: ChatRequestBody,
  messages: ChatMessageInput[],
  env: ChatServerEnv,
  request: Request,
): PreparedChatStream {
  if (providerMode === 'stateful-engram') {
    if (!env.ENGRAM_BASE_URL) {
      throw new Error('Missing ENGRAM_BASE_URL on the server.');
    }

    const sentMessages = latestUserOnly(messages);
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
          compatibilityMode: 'append-only',
        },
      },
    });

    return {
      textStream: result.textStream,
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

  const statelessProvider = getStatelessProvider(env);
  const { model, result } = prepareStatelessProviderStream(
    statelessProvider,
    body,
    messages,
    env,
    request,
  );

  const metadataMessages = providerMode === 'simulated-engram'
    ? latestUserOnly(messages)
    : messages;

  const metadata = buildBaseMetadata(
    providerMode,
    model,
    body,
    messages,
    metadataMessages,
    providerMode === 'simulated-engram' ? 'engram-delta' : 'full-history',
    statelessProvider,
  );

  if (providerMode === 'simulated-engram') {
    metadata.conversationId = getConversationId(body, messages);
    metadata.engram = { simulated: true, compatibilityResult: 'simulated' };
  }

  return {
    textStream: result.textStream,
    providerMetadata: result.providerMetadata,
    metadata,
  };
}

import { createClarit } from '@clarit.ai/vercel-ai-provider';
import type { ClaritSnapshotClient, SnapshotMetadata } from '@clarit.ai/vercel-ai-provider/snapshots';
import { streamText } from 'ai';
import { extractEngramMetadata } from './chatProviders';
import type {
  ChatMessageInput,
  ChatProviderMetadata,
  ChatRole,
  ChatServerEnv,
} from './types';
import type { PlaybackExportFile } from '../lib/playbackExportTypes';
import {
  buildStatelessHistories,
  computeComparativeTotals,
  type ComparativeEngramMetrics,
  type ComparativeRecordingMetadata,
  type ComparativeTurnMetrics,
  type StatelessBaseline,
} from '../lib/comparativeRecording';
import { estimateRequestTokens } from '../lib/agentRequestBundle';

const DO_INFERENCE_BASE_URL = 'https://inference.do-ai.run';
const DO_NEMOTRON_NANO_OMNI_MODEL = 'nemotron-3-nano-omni';
const DEFAULT_MAX_OUTPUT_TOKENS = 512;

interface ComparativeRecordingScript {
  title?: string;
  system?: string;
  prompts: string[];
  model?: string;
  temperature?: number;
  seed?: number | null;
  maxOutputTokens?: number;
}

interface GeneratedTurn {
  userMessage: ChatMessageInput;
  assistantMessage: ChatMessageInput;
  requestBody: {
    model: string;
    messages: ChatMessageInput[];
    stream: true;
    temperature: number;
    seed?: number;
    maxOutputTokens: number;
    providerMode: 'stateful-engram';
    conversationId: string;
    turnNumber: number;
  };
  responseText: string;
  durationMs: number;
  metadata: ChatProviderMetadata;
  engram: ComparativeEngramMetrics;
}

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowMs(): number {
  return Date.now();
}

function elapsedMs(start: number): number {
  return Math.round(performance.now() - start);
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

function titleFromScript(script: ComparativeRecordingScript): string {
  return script.title?.trim() || script.prompts[0]?.trim().slice(0, 54) || 'Comparative recording';
}

function normalizeScript(value: unknown): ComparativeRecordingScript {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const prompts = Array.isArray(record.prompts)
    ? record.prompts.filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
    : [];

  if (prompts.length === 0) {
    throw new Error('Comparative recording requires a non-empty prompts array.');
  }

  return {
    title: typeof record.title === 'string' ? record.title : undefined,
    system: typeof record.system === 'string' && record.system.trim() ? record.system : undefined,
    prompts,
    model: typeof record.model === 'string' ? record.model : undefined,
    temperature: typeof record.temperature === 'number' ? record.temperature : 0,
    seed: typeof record.seed === 'number' ? record.seed : null,
    maxOutputTokens: typeof record.maxOutputTokens === 'number'
      ? record.maxOutputTokens
      : DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

function normalizeMessagesForTokenizer(
  messages: Array<{ role: ChatRole; content: string }>,
) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function tokenizeChatCount(
  snapshots: ClaritSnapshotClient,
  messages: Array<{ role: ChatRole; content: string }>,
): Promise<number> {
  const result = await snapshots.tokenizeChat({
    messages: normalizeMessagesForTokenizer(messages),
    add_generation_prompt: true,
  });

  if (!result.success) {
    throw new Error(result.message || 'Engram tokenizer failed.');
  }

  return result.token_count ?? result.token_ids?.length ?? 0;
}

function numberFrom(metadata: SnapshotMetadata | undefined, keys: string[]): number | undefined {
  if (!metadata) return undefined;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function snapshotSizeMb(metadata: SnapshotMetadata | undefined): number | null {
  const mb = numberFrom(metadata, [
    'snapshot_size_mb',
    'snapshotSizeMb',
    'size_mb',
    'sizeMb',
  ]);
  if (mb !== undefined) return Math.round(mb * 10) / 10;

  const bytes = numberFrom(metadata, [
    'snapshot_size_bytes',
    'snapshotSizeBytes',
    'size_bytes',
    'sizeBytes',
    'bytes',
  ]);
  if (bytes === undefined) return null;
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

async function measureRestoreLatency(
  snapshots: ClaritSnapshotClient,
  conversationId: string,
  turnNumber: number,
): Promise<number> {
  const started = performance.now();
  const result = await snapshots.restore({
    conversation_id: conversationId,
    turn_number: turnNumber,
  });
  const latency = elapsedMs(started);

  if (!result.success) {
    throw new Error(result.message || `Engram restore failed for turn ${turnNumber}.`);
  }

  return latency;
}

function digitalOceanKey(env: ChatServerEnv): string {
  const key = env.DIGITALOCEAN_MODEL_ACCESS_KEY || env.DIGITALOCEAN_TOKEN;
  if (!key) {
    throw new Error('Missing DIGITALOCEAN_MODEL_ACCESS_KEY for stateless measurement.');
  }
  return key;
}

async function measureDigitalOceanTtft(
  env: ChatServerEnv,
  model: string,
  messages: Array<{ role: ChatRole; content: string }>,
): Promise<number> {
  const baseUrl = env.DIGITALOCEAN_INFERENCE_BASE_URL || DO_INFERENCE_BASE_URL;
  const started = performance.now();
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${digitalOceanKey(env)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0,
      max_tokens: 1,
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = response.statusText;
    }
    throw new Error(`DigitalOcean stateless measurement failed (${response.status}): ${detail}`);
  }

  if (!response.body) {
    throw new Error('DigitalOcean stateless measurement did not return a stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (typeof content === 'string' && content.length > 0) {
            await reader.cancel();
            return elapsedMs(started);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error('DigitalOcean stateless measurement ended before first token.');
}

async function generateEngramTurn(params: {
  clarit: ReturnType<typeof createClarit>;
  snapshots: ClaritSnapshotClient;
  env: ChatServerEnv;
  model: string;
  conversationId: string;
  turnNumber: number;
  messages: ChatMessageInput[];
  temperature: number;
  seed: number | null;
  maxOutputTokens: number;
}): Promise<GeneratedTurn> {
  const sentMessages = latestUserOnly(params.messages);
  const userMessage = [...params.messages].reverse().find((message) => message.role === 'user');
  if (!userMessage) throw new Error(`Turn ${params.turnNumber} is missing a user message.`);

  const restoreMode = params.env.COMPARATIVE_RECORDING_RESTORE_MEASUREMENT || 'explicit-restore';
  let restoreLatencyMs: number | null = null;
  let restoreLatencySource: ComparativeEngramMetrics['restoreLatencySource'];
  if (params.turnNumber > 1 && restoreMode === 'explicit-restore') {
    restoreLatencyMs = await measureRestoreLatency(
      params.snapshots,
      params.conversationId,
      params.turnNumber - 1,
    );
    restoreLatencySource = 'explicit-restore';
  }

  const startedAt = nowMs();
  const result = streamText({
    model: params.clarit(params.model),
    messages: sentMessages,
    temperature: params.temperature,
    seed: params.seed ?? undefined,
    maxOutputTokens: params.maxOutputTokens,
    providerOptions: {
      clarit: {
        conversationId: params.conversationId,
        turnNumber: params.turnNumber,
        autoSaveSnapshot: true,
        compatibilityMode: 'append-only',
        maxNewTokens: params.maxOutputTokens,
      },
    },
  });

  let responseText = '';
  for await (const delta of result.textStream) {
    responseText += delta;
  }

  const durationMs = nowMs() - startedAt;
  const providerMetadata = await result.providerMetadata;
  const engramMetadata = extractEngramMetadata(providerMetadata);
  if (params.turnNumber > 1 && restoreMode === 'provider-metadata') {
    restoreLatencyMs = engramMetadata?.restoreLatencyMs ?? null;
    restoreLatencySource = restoreLatencyMs === null ? undefined : 'provider-metadata';
  }

  const snapshotInfo = await params.snapshots.getInfo({
    conversation_id: params.conversationId,
    turn_number: params.turnNumber,
  });
  const snapshotMetadata = snapshotInfo.success ? snapshotInfo.metadata : undefined;
  const snapshotSize = engramMetadata?.snapshotSizeMb
    ?? (engramMetadata?.snapshotSizeBytes !== undefined
      ? Math.round((engramMetadata.snapshotSizeBytes / (1024 * 1024)) * 10) / 10
      : snapshotSizeMb(snapshotMetadata));
  const tokensProcessed = await tokenizeChatCount(params.snapshots, sentMessages);

  if (params.turnNumber > 1 && restoreLatencyMs === null) {
    throw new Error(`Missing real Engram restore latency for turn ${params.turnNumber}.`);
  }

  const assistantMessage: ChatMessageInput = {
    id: makeId(`assistant-${params.turnNumber}`),
    role: 'assistant',
    content: responseText,
  };

  return {
    userMessage,
    assistantMessage,
    requestBody: {
      model: params.model,
      messages: sentMessages,
      stream: true,
      temperature: params.temperature,
      seed: params.seed ?? undefined,
      maxOutputTokens: params.maxOutputTokens,
      providerMode: 'stateful-engram',
      conversationId: params.conversationId,
      turnNumber: params.turnNumber,
    },
    responseText,
    durationMs,
    metadata: {
      providerMode: 'stateful-engram',
      model: params.model,
      conversationId: params.conversationId,
      turnNumber: params.turnNumber,
      requestShape: 'engram-delta',
      sentMessageCount: sentMessages.length,
      canonicalMessageCount: params.messages.length,
      estimatedInputTokens: tokensProcessed,
      engram: engramMetadata,
    },
    engram: {
      tokensProcessed,
      restoreLatencyMs,
      restoreLatencySource,
      snapshotSaved: engramMetadata?.snapshotSaved === true,
      snapshotId: engramMetadata?.snapshotId,
      snapshotSizeMb: snapshotSize,
    },
  };
}

async function measureStatelessTurns(params: {
  snapshots: ClaritSnapshotClient;
  env: ChatServerEnv;
  model: string;
  transcript: Array<{ role: ChatRole; content: string }>;
}): Promise<Array<{ cumulativeTokens: number; prefillLatencyMs: number }>> {
  const histories = buildStatelessHistories(params.transcript);
  const metrics: Array<{ cumulativeTokens: number; prefillLatencyMs: number }> = [];

  for (const history of histories) {
    const cumulativeTokens = await tokenizeChatCount(params.snapshots, history.messages);
    const prefillLatencyMs = await measureDigitalOceanTtft(
      params.env,
      params.model,
      history.messages,
    );
    metrics.push({ cumulativeTokens, prefillLatencyMs });
  }

  return metrics;
}

export async function buildComparativeRecording(
  input: unknown,
  env: ChatServerEnv,
): Promise<PlaybackExportFile> {
  if (env.COMPARATIVE_RECORDING_ENABLED !== 'true') {
    throw new Error('Comparative recording is not enabled.');
  }
  if (!env.ENGRAM_BASE_URL) {
    throw new Error('Missing ENGRAM_BASE_URL for comparative recording.');
  }

  const script = normalizeScript(input);
  const model = script.model || env.COMPARATIVE_RECORDING_MODEL || env.ENGRAM_MODEL || DO_NEMOTRON_NANO_OMNI_MODEL;
  const statelessModel = env.DIGITALOCEAN_INFERENCE_MODEL || script.model || env.COMPARATIVE_RECORDING_MODEL || DO_NEMOTRON_NANO_OMNI_MODEL;
  const sessionId = makeId('comparative');
  const conversationId = sessionId;
  const recordedAt = nowMs();
  const clarit = createClarit({
    baseURL: env.ENGRAM_BASE_URL,
    apiKey: env.ENGRAM_API_KEY,
    adminApiKey: env.ENGRAM_ADMIN_API_KEY,
  });

  const canonical: ChatMessageInput[] = script.system
    ? [{ id: makeId('system'), role: 'system', content: script.system }]
    : [];
  const generated: GeneratedTurn[] = [];

  for (let index = 0; index < script.prompts.length; index += 1) {
    canonical.push({
      id: makeId(`user-${index + 1}`),
      role: 'user',
      content: script.prompts[index],
    });

    const turn = await generateEngramTurn({
      clarit,
      snapshots: clarit.snapshots,
      env,
      model,
      conversationId,
      turnNumber: index + 1,
      messages: canonical,
      temperature: script.temperature ?? 0,
      seed: script.seed ?? null,
      maxOutputTokens: script.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    });
    canonical.push(turn.assistantMessage);
    generated.push(turn);
  }

  const transcript = canonical.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const stateless = await measureStatelessTurns({
    snapshots: clarit.snapshots,
    env,
    model: statelessModel,
    transcript,
  });

  const comparativeTurns: ComparativeTurnMetrics[] = generated.map((turn, index) => ({
    index,
    user: turn.userMessage.content,
    assistant: turn.responseText,
    engram: turn.engram,
    stateless: stateless[index],
  }));
  const totals = computeComparativeTotals(comparativeTurns);
  const comparative: ComparativeRecordingMetadata = {
    sessionId,
    model,
    generation: {
      temperature: script.temperature ?? 0,
      seed: script.seed ?? null,
    },
    statelessProvider: 'digitalocean-serverless',
    statelessModel,
    statelessBaseline: 'cold-reprocess' satisfies StatelessBaseline,
    promptCaching: {
      mode: 'disabled',
    },
    recordedAt,
  };

  const messageTimestampBase = recordedAt;
  return {
    conversation: {
      id: conversationId,
      title: titleFromScript(script),
      messages: canonical.map((message, index) => ({
        id: message.id || makeId(`${message.role}-${index}`),
        role: message.role,
        content: message.content,
        timestamp: messageTimestampBase + index,
        tokenCount: estimateRequestTokens(message.content),
      })),
      createdAt: recordedAt,
      updatedAt: nowMs(),
      mode: 'stateful',
      model,
    },
    turnPayloads: generated.map((turn, index) => ({
      id: makeId(`turn-${index + 1}`),
      request: {
        body: turn.requestBody,
        tokenCount: turn.engram.tokensProcessed,
        messageCount: turn.requestBody.messages.length,
        timestamp: messageTimestampBase + index,
        providerMode: 'stateful-engram',
      },
      response: {
        body: turn.responseText,
        duration: turn.durationMs,
        tokenCount: estimateRequestTokens(turn.responseText),
      },
      providerMetadata: turn.metadata,
      redundantTokens: Math.max(0, comparativeTurns[index].stateless.cumulativeTokens - turn.engram.tokensProcessed),
      newTokens: turn.engram.tokensProcessed,
      comparative: comparativeTurns[index],
    })),
    comparative,
    totals,
    exportedAt: nowMs(),
    exportVersion: 3,
    exportSource: 'clarit-comparative-recorder',
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function handleComparativeRecordingRequest(
  request: Request,
  env: ChatServerEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Unsupported comparative recording method.' }, 405);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Comparative recording requires a JSON body.' }, 400);
  }

  try {
    const payload = await buildComparativeRecording(body, env);
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500);
  }
}
import type { ChatTurnMessage, RecordingTurnTrace } from '../store/chatStore';
import type { ChatProviderMetadata } from '../server/types';
import { estimateRequestTokens } from '../lib/agentRequestBundle';

export interface PlaybackExportInput {
  messages: ChatTurnMessage[];
  recordingTurns: RecordingTurnTrace[];
  model: string;
  title?: string;
  mode?: 'stateless' | 'stateful';
}

interface PlaybackExportFile {
  conversation: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: ChatTurnMessage['role'];
      content: string;
      timestamp: number;
      tokenCount: number;
    }>;
    createdAt: number;
    updatedAt: number;
    mode: 'stateless' | 'stateful';
    model: string;
  };
  turnPayloads: Array<{
    id: string;
    request: {
      body: unknown;
      tokenCount: number;
      messageCount: number;
      timestamp: number;
      providerMode: string;
    };
    response: {
      body: string;
      duration: number;
      tokenCount: number;
    } | null;
    providerMetadata?: ChatProviderMetadata | null;
    redundantTokens: number;
    newTokens: number;
    error?: string;
  }>;
  exportedAt: number;
  exportVersion: 2;
  exportSource: 'clarit-ngram-simulation-recorder';
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `recording-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(messages: ChatTurnMessage[]): string {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return 'Recorded simulation playback';
  return firstUser.content.trim().replace(/\s+/g, ' ').slice(0, 54) || 'Recorded simulation playback';
}

function tokenCountFor(message: ChatTurnMessage): number {
  return estimateRequestTokens(message.content);
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      const lower = key.toLowerCase();
      if (
        lower.includes('authorization') ||
        lower.includes('api_key') ||
        lower.includes('apikey') ||
        lower.includes('token') ||
        lower.includes('secret')
      ) {
        return [key, '[REDACTED]'];
      }
      return [key, redactValue(entry)];
    }),
  );
}

export function buildPlaybackExport(input: PlaybackExportInput): PlaybackExportFile {
  const now = Date.now();
  const createdAt = input.messages[0]?.timestamp ?? now;
  const updatedAt = input.messages[input.messages.length - 1]?.timestamp ?? now;
  const title = input.title?.trim() || deriveTitle(input.messages);
  const mode = input.mode ?? input.recordingTurns[input.recordingTurns.length - 1]?.mode ?? 'stateless';

  return {
    conversation: {
      id: makeId(),
      title,
      messages: input.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        tokenCount: tokenCountFor(message),
      })),
      createdAt,
      updatedAt,
      mode,
      model: input.model,
    },
    turnPayloads: input.recordingTurns.map((turn) => ({
      id: turn.id,
      request: {
        body: redactValue(turn.request.body),
        tokenCount: turn.request.tokenCount,
        messageCount: turn.request.messageCount,
        timestamp: turn.request.timestamp,
        providerMode: turn.providerMode,
      },
      response: turn.response,
      providerMetadata: redactValue(turn.providerMetadata) as ChatProviderMetadata | null | undefined,
      redundantTokens: turn.redundantTokens,
      newTokens: turn.newTokens,
      error: turn.error,
    })),
    exportedAt: now,
    exportVersion: 2,
    exportSource: 'clarit-ngram-simulation-recorder',
  };
}

export function stringifyPlaybackExport(input: PlaybackExportInput): string {
  return JSON.stringify(buildPlaybackExport(input), null, 2);
}

export function makePlaybackExportFilename(title: string, at = Date.now()): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'simulation-playback';
  const stamp = new Date(at).toISOString().replace(/[:.]/g, '-');
  return `${slug}-${stamp}.json`;
}

export function downloadTextFile(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime}; charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

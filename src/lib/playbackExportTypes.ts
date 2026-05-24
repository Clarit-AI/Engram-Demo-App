import type { ChatProviderMetadata, ChatRole } from '../server/types';
import type {
  ComparativeRecordingMetadata,
  ComparativeTotals,
  ComparativeTurnMetrics,
} from './comparativeRecording';

export interface PlaybackExportFile {
  conversation: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: ChatRole;
      content: string;
      timestamp: number;
      tokenCount: number;
    }>;
    createdAt: number;
    updatedAt: number;
    mode: 'stateless' | 'stateful';
    /** The inference mode under which the session was originally recorded. */
    recordingMode: 'stateless' | 'stateful';
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
    comparative?: ComparativeTurnMetrics;
  }>;
  comparative?: ComparativeRecordingMetadata;
  totals?: ComparativeTotals;
  exportedAt: number;
  exportVersion: 2 | 3;
  exportSource: 'clarit-ngram-simulation-recorder' | 'clarit-comparative-recorder';
}

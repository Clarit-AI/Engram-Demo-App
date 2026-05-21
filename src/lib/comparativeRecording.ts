import type { ChatRole } from '../server/types';

export type StatelessBaseline = 'cold-reprocess' | 'prefix-caching';

export interface ComparativeRecordingMetadata {
  sessionId: string;
  model: string;
  generation: {
    temperature: number;
    seed: number | null;
  };
  statelessProvider: 'digitalocean-serverless';
  statelessModel: string;
  statelessBaseline: StatelessBaseline;
  promptCaching: {
    mode: 'disabled' | 'enabled';
    requestParameter?: string;
  };
  recordedAt: number;
}

export interface ComparativeEngramMetrics {
  tokensProcessed: number;
  restoreLatencyMs: number | null;
  restoreLatencySource?: 'provider-metadata' | 'explicit-restore';
  snapshotSaved: boolean;
  snapshotId?: string;
  snapshotSizeMb: number | null;
}

export interface ComparativeStatelessMetrics {
  cumulativeTokens: number;
  prefillLatencyMs: number;
}

export interface ComparativeTurnMetrics {
  index: number;
  user: string;
  assistant: string;
  engram: ComparativeEngramMetrics;
  stateless: ComparativeStatelessMetrics;
}

export interface ComparativeTotals {
  engramTokens: number;
  statelessTokens: number;
  tokenReductionPct: number;
}

export interface ComparativePlaybackData {
  metadata: ComparativeRecordingMetadata;
  turns: ComparativeTurnMetrics[];
  totals: ComparativeTotals;
}

export interface StatelessHistoryTurn {
  index: number;
  user: string;
  messages: Array<{ role: ChatRole; content: string }>;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeComparativeTotals(
  turns: ComparativeTurnMetrics[],
): ComparativeTotals {
  const engramTokens = turns.reduce((sum, turn) => sum + turn.engram.tokensProcessed, 0);
  const statelessTokens = turns.reduce((sum, turn) => sum + turn.stateless.cumulativeTokens, 0);
  const tokenReductionPct = statelessTokens > 0
    ? roundPct(((statelessTokens - engramTokens) / statelessTokens) * 100)
    : 0;

  return {
    engramTokens,
    statelessTokens,
    tokenReductionPct,
  };
}

export function buildStatelessHistories(
  messages: Array<{ role: ChatRole; content: string }>,
): StatelessHistoryTurn[] {
  const system = messages.filter((message) => message.role === 'system');
  const conversation = messages.filter((message) => message.role !== 'system');
  const turns: StatelessHistoryTurn[] = [];

  for (let index = 0; index < conversation.length; index += 2) {
    const user = conversation[index];
    if (user?.role !== 'user') break;

    const priorAndCurrent = conversation.slice(0, index + 1);
    turns.push({
      index: turns.length,
      user: user.content,
      messages: [
        ...system.map((message) => ({ role: message.role, content: message.content })),
        ...priorAndCurrent.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    });
  }

  return turns;
}
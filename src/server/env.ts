import type { ChatServerEnv, ProviderMode } from './types';

export const OPENROUTER_BASE_URL_DEFAULT = 'https://openrouter.ai/api/v1';
export const NVIDIA_NIM_BASE_URL_DEFAULT = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_STATELESS_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
export const DEFAULT_ENGRAM_MODEL = DEFAULT_STATELESS_MODEL;

export type StatelessProviderName = 'openrouter' | 'nvidia-nim';

const providerModes = new Set<ProviderMode>([
  'stateless-openrouter',
  'simulated-engram',
  'stateful-engram',
]);

export function isProviderMode(value: unknown): value is ProviderMode {
  return typeof value === 'string' && providerModes.has(value as ProviderMode);
}

export function normalizeProviderMode(
  value: unknown,
  fallback: ProviderMode = 'stateless-openrouter',
): ProviderMode {
  if (isProviderMode(value)) return value;
  if (value === 'stateless') return 'stateless-openrouter';
  if (value === 'stateful') return 'simulated-engram';
  return fallback;
}

export function getDefaultProviderMode(env: ChatServerEnv): ProviderMode {
  return normalizeProviderMode(env.DEFAULT_PROVIDER_MODE, 'stateless-openrouter');
}

export function getStatelessModel(env: ChatServerEnv, requested?: string): string {
  return requested || env.DEFAULT_STATELESS_MODEL || DEFAULT_STATELESS_MODEL;
}

export function getStatelessProvider(env: ChatServerEnv): StatelessProviderName {
  const provider = env.STATELESS_PROVIDER?.toLowerCase();
  if (provider === 'nvidia' || provider === 'nvidia-nim' || provider === 'nim') {
    return 'nvidia-nim';
  }
  return 'openrouter';
}

export function getOpenRouterModel(env: ChatServerEnv, requested?: string): string {
  return requested || env.DEFAULT_STATELESS_MODEL || DEFAULT_STATELESS_MODEL;
}

export function getNvidiaNimModel(env: ChatServerEnv, requested?: string): string {
  return env.NVIDIA_NIM_MODEL || requested || env.DEFAULT_STATELESS_MODEL || DEFAULT_STATELESS_MODEL;
}

export function getEngramModel(env: ChatServerEnv, requested?: string): string {
  return env.ENGRAM_MODEL || requested || env.DEFAULT_STATELESS_MODEL || DEFAULT_ENGRAM_MODEL;
}

export function makeConversationId(messagesSeed: string): string {
  let h = 0;
  for (let i = 0; i < messagesSeed.length; i += 1) {
    h = ((h << 5) - h + messagesSeed.charCodeAt(i)) | 0;
  }
  return `ctx_${(h >>> 0).toString(16).padStart(8, '0')}`;
}

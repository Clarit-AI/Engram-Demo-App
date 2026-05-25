import type { ChatServerEnv } from './types';

export type EngramHealthStatus = 'unknown' | 'healthy' | 'offline';

interface EngramHealthState {
  status: EngramHealthStatus;
  consecutiveFailures: number;
  lastChecked: number;
}

let state: EngramHealthState = {
  status: 'unknown',
  consecutiveFailures: 0,
  lastChecked: 0,
};

let monitorStarted = false;

export function getEngramHealth(): EngramHealthState {
  return state;
}

export function recordEngramSuccess(): void {
  state = { status: 'healthy', consecutiveFailures: 0, lastChecked: Date.now() };
}

export function recordEngramFailure(): void {
  const failures = state.consecutiveFailures + 1;
  state = {
    status: failures >= 2 ? 'offline' : state.status,
    consecutiveFailures: failures,
    lastChecked: Date.now(),
  };
}

async function probeEngram(baseURL: string, apiKey?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const response = await fetch(`${baseURL}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      recordEngramSuccess();
    } else {
      recordEngramFailure();
    }
  } catch {
    recordEngramFailure();
  }
}

export function startEngramHealthMonitor(env: ChatServerEnv): void {
  if (!env.ENGRAM_BASE_URL || monitorStarted) return;
  monitorStarted = true;

  const baseURL = env.ENGRAM_BASE_URL;
  const apiKey = env.ENGRAM_API_KEY;
  void probeEngram(baseURL, apiKey);
  setInterval(() => void probeEngram(baseURL, apiKey), 30_000);
}

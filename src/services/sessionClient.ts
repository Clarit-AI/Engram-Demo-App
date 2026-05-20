import type { RateLimitMetadata, SessionMetadata } from '../server/types';

export interface DemoSessionState {
  session: SessionMetadata | null;
  rateLimit: RateLimitMetadata | null;
  cookieRequired: boolean;
  debug: boolean;
}

const SESSION_API_URL = import.meta.env.VITE_SESSION_API_URL || '/api/session/heartbeat';

export async function heartbeatDemoSession(): Promise<DemoSessionState> {
  const response = await fetch(SESSION_API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ event: 'heartbeat', at: Date.now() }),
  });

  if (!response.ok) {
    let message = `Session heartbeat failed with ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  return response.json() as Promise<DemoSessionState>;
}

import { useEffect } from 'react';
import { heartbeatDemoSession } from '../services/sessionClient';
import { useSessionStore } from '../store/sessionStore';

const HEARTBEAT_INTERVAL_MS = 25_000;

export function useDemoSessionHeartbeat(enabled: boolean) {
  const setSession = useSessionStore((s) => s.setSession);
  const setError = useSessionStore((s) => s.setError);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const beat = async () => {
      try {
        const result = await heartbeatDemoSession();
        if (!cancelled && result.session) {
          setSession(result.session, result.rateLimit);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : String(error));
        }
      }

      if (!cancelled) {
        timer = window.setTimeout(beat, HEARTBEAT_INTERVAL_MS);
      }
    };

    void beat();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, setError, setSession]);
}

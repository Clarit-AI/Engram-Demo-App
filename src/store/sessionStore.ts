import { create } from 'zustand';
import type { RateLimitMetadata, SessionMetadata } from '../server/types';

type SessionStatus = 'idle' | 'ready' | 'error';

interface SessionState {
  status: SessionStatus;
  session: SessionMetadata | null;
  rateLimit: RateLimitMetadata | null;
  errorMessage: string | null;
  setSession: (session: SessionMetadata, rateLimit: RateLimitMetadata | null) => void;
  setError: (message: string) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'idle',
  session: null,
  rateLimit: null,
  errorMessage: null,

  setSession: (session, rateLimit) =>
    set({
      status: 'ready',
      session,
      rateLimit,
      errorMessage: null,
    }),

  setError: (message) =>
    set({
      status: 'error',
      errorMessage: message,
    }),
}));

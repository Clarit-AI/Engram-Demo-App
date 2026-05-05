/**
 * chatStore.ts — live conversation state for the "Actually Chat" mode.
 *
 * Kept separate from arcStore (which is the demo-arc state machine) so
 * the demo and live chat remain reasoning-independent. The two stores
 * intersect only at the orchestrator layer (useLiveTurn) and via the
 * shared single-stream clock that arcStore already exposes.
 */

import { create } from 'zustand';

export interface ChatTurnMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export type LiveStatus = 'idle' | 'streaming-request' | 'awaiting' | 'streaming-response' | 'done' | 'error';

interface ChatState {
  messages: ChatTurnMessage[];
  /** Status of the current turn's live exchange. Drives UI affordances. */
  status: LiveStatus;
  /** Last error message (if status is 'error'). */
  errorMessage: string | null;
  /** Live-streaming buffer for the in-flight assistant response. */
  liveAssistantBuffer: string;

  appendUser: (content: string) => string; // returns id
  beginAssistant: () => string;            // returns id
  appendAssistantDelta: (delta: string) => void;
  finalizeAssistant: () => void;
  setStatus: (s: LiveStatus) => void;
  setError: (msg: string) => void;
  reset: () => void;
}

const mkId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  status: 'idle',
  errorMessage: null,
  liveAssistantBuffer: '',

  appendUser: (content) => {
    const id = mkId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'user', content, timestamp: Date.now() }],
    }));
    return id;
  },

  beginAssistant: () => {
    const id = mkId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: 'assistant', content: '', timestamp: Date.now() },
      ],
      liveAssistantBuffer: '',
    }));
    return id;
  },

  appendAssistantDelta: (delta) => {
    set((s) => {
      const buf = s.liveAssistantBuffer + delta;
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role !== 'assistant') return { liveAssistantBuffer: buf };
      return {
        liveAssistantBuffer: buf,
        messages: [
          ...s.messages.slice(0, -1),
          { ...last, content: buf },
        ],
      };
    });
  },

  finalizeAssistant: () => {
    const buf = get().liveAssistantBuffer;
    set((s) => {
      const last = s.messages[s.messages.length - 1];
      if (!last || last.role !== 'assistant') return { liveAssistantBuffer: '' };
      return {
        liveAssistantBuffer: '',
        messages: [
          ...s.messages.slice(0, -1),
          { ...last, content: buf },
        ],
      };
    });
  },

  setStatus: (status) => set({ status, errorMessage: status === 'error' ? get().errorMessage : null }),
  setError: (msg) => set({ status: 'error', errorMessage: msg }),

  reset: () =>
    set({
      messages: [],
      status: 'idle',
      errorMessage: null,
      liveAssistantBuffer: '',
    }),
}));

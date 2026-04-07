import { create } from 'zustand';
import type { Message, TurnPayload, LLMMode, AppMode } from '../services/types';
import { estimateTokens } from '../services/tokenizer';

const SYSTEM_PROMPT = `You are a helpful AI assistant. You provide clear, accurate answers to questions about any topic. Be concise but thorough.`;

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

interface DemoState {
  // App mode (set by landing modal)
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;

  // Demo playback
  demoPlaying: boolean;
  demoPaused: boolean;
  demoProgress: number;
  startDemo: () => void;
  pauseDemo: () => void;
  resumeDemo: () => void;
  skipToStateful: () => void;
  replayDemo: () => void;
  setDemoProgress: (p: number) => void;

  // Inference mode
  mode: LLMMode;
  setMode: (mode: LLMMode) => void;

  // Model
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Conversation
  messages: Message[];
  systemPrompt: Message;
  addUserMessage: (text: string) => Message;
  addAssistantMessage: (text: string) => void;
  appendToAssistantMessage: (chunk: string) => void;
  clearConversation: () => void;

  // Turn tracking
  turnPayloads: TurnPayload[];
  addTurnPayload: (payload: TurnPayload) => void;
  updateTurnPayloadResponse: (id: string, response: TurnPayload['response']) => void;

  // Metrics (cached for animation)
  currentTurn: number;
  totalTokensSent: number;
  totalTokensWasted: number;
  currentPayloadTokens: number;
  currentNewTokens: number;
  redundancyPercent: number;
  scaleMultiplier: number;

  // Per-message resend tracking: messageId -> times included in a payload
  resendCounts: Record<string, number>;

  // UI
  isStreaming: boolean;
  setStreaming: (s: boolean) => void;
  toggleScaleMultiplier: () => void;
}

const systemMessage: Message = {
  id: 'system-prompt',
  role: 'system',
  content: SYSTEM_PROMPT,
  tokenCount: estimateTokens(SYSTEM_PROMPT),
  timestamp: Date.now(),
};

export const useDemoStore = create<DemoState>((set) => ({
  appMode: null,
  setAppMode: (mode) => set({ appMode: mode }),

  demoPlaying: false,
  demoPaused: false,
  demoProgress: 0,
  startDemo: () => set({ demoPlaying: true, demoPaused: false, demoProgress: 0 }),
  pauseDemo: () => set({ demoPaused: true }),
  resumeDemo: () => set({ demoPaused: false }),
  skipToStateful: () => set({ mode: 'stateful', demoPlaying: false }),
  replayDemo: () => set({
    demoPlaying: true, demoPaused: false, demoProgress: 0,
    mode: 'stateless', messages: [], turnPayloads: [],
    resendCounts: {}, currentTurn: 0,
    totalTokensSent: 0, totalTokensWasted: 0,
    currentPayloadTokens: 0, currentNewTokens: 0, redundancyPercent: 0,
  }),
  setDemoProgress: (p) => set({ demoProgress: p }),

  mode: 'stateless',
  setMode: (mode) => set((state) => {
    // If demo was playing and we're switching to stateless, replay from start
    if (mode === 'stateless' && state.demoPlaying) {
      return {
        mode,
        demoPlaying: true,
        demoPaused: false,
        demoProgress: 0,
        messages: [],
        turnPayloads: [],
        resendCounts: {},
        currentTurn: 0,
        totalTokensSent: 0,
        totalTokensWasted: 0,
        currentPayloadTokens: 0,
        currentNewTokens: 0,
        redundancyPercent: 0,
        isStreaming: false,
      };
    }
    // Normal mode switch - clear conversation
    return {
      mode,
      messages: [],
      turnPayloads: [],
      resendCounts: {},
      currentTurn: 0,
      totalTokensSent: 0,
      totalTokensWasted: 0,
      currentPayloadTokens: 0,
      currentNewTokens: 0,
      redundancyPercent: 0,
      isStreaming: false,
    };
  }),

  selectedModel: import.meta.env.VITE_DEFAULT_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct:free',
  setSelectedModel: (model) => set({ selectedModel: model }),

  messages: [],
  systemPrompt: systemMessage,

  addUserMessage: (text: string) => {
    const msg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      tokenCount: estimateTokens(text),
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
    return msg;
  },

  addAssistantMessage: (text: string) => {
    const msg: Message = {
      id: uid(),
      role: 'assistant',
      content: text,
      tokenCount: estimateTokens(text),
      timestamp: Date.now(),
    };
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  appendToAssistantMessage: (chunk: string) => {
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          content: last.content + chunk,
          tokenCount: estimateTokens(last.content + chunk),
        };
      }
      return { messages: msgs };
    });
  },

  clearConversation: () => set({
    messages: [],
    turnPayloads: [],
    resendCounts: {},
    currentTurn: 0,
    totalTokensSent: 0,
    totalTokensWasted: 0,
    currentPayloadTokens: 0,
    currentNewTokens: 0,
    redundancyPercent: 0,
    isStreaming: false,
  }),

  turnPayloads: [],

  addTurnPayload: (payload: TurnPayload) => {
    set((s) => {
      const newTurn = s.currentTurn + 1;
      const newTokensSent = s.totalTokensSent + payload.request.tokenCount;
      const newTokensWasted = s.totalTokensWasted + payload.redundantTokens;
      const redundancy = payload.request.tokenCount > 0
        ? Math.round((payload.redundantTokens / payload.request.tokenCount) * 100)
        : 0;

      // Update resend counts: every message in the payload (except the newest) gets +1
      const resendCounts = { ...s.resendCounts };
      for (const msg of payload.request.body.messages) {
        // We count resends by role+content fingerprint since we don't have IDs in payload
        const key = `${msg.role}:${msg.content.slice(0, 50)}`;
        resendCounts[key] = (resendCounts[key] || 0) + 1;
      }

      return {
        turnPayloads: [...s.turnPayloads, payload],
        currentTurn: newTurn,
        totalTokensSent: newTokensSent,
        totalTokensWasted: newTokensWasted,
        currentPayloadTokens: payload.request.tokenCount,
        currentNewTokens: payload.newTokens,
        redundancyPercent: redundancy,
        resendCounts,
      };
    });
  },

  updateTurnPayloadResponse: (id, response) => {
    set((s) => ({
      turnPayloads: s.turnPayloads.map(tp =>
        tp.id === id ? { ...tp, response, isStreaming: false } : tp
      ),
    }));
  },

  currentTurn: 0,
  totalTokensSent: 0,
  totalTokensWasted: 0,
  currentPayloadTokens: 0,
  currentNewTokens: 0,
  redundancyPercent: 0,
  scaleMultiplier: 1,
  resendCounts: {},

  isStreaming: false,
  setStreaming: (s) => set({ isStreaming: s }),
  toggleScaleMultiplier: () => set((s) => ({ scaleMultiplier: s.scaleMultiplier === 1 ? 1000 : 1 })),
}));

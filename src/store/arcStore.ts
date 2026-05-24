/**
 * arcStore.ts — state machine for the Clinical Futurist "Re-Read" demo.
 *
 * Deliberately minimal for Phase 1. Drives: landing → demo arc → reveal →
 * post-arc → (optional) live chat mode. Expands in later phases as the
 * streaming engine and chat service lock in.
 *
 * Key responsibilities:
 *   - track current arc phase + turn index
 *   - hold the loaded demo catalog + active demo key
 *   - expose setters used by the orchestrator / UI controls
 *
 * Streaming state (currentChar, currentTurnPayload, isStreaming) and chat
 * state (messages, server-side provider status) lives in purpose-built
 * stores; this store is the single source of truth
 * for the arc state machine only.
 */

import { create } from 'zustand';
import type { DemoMeta } from '../services/demoLibrary';
import { DEFAULT_DEMO_KEY } from '../services/demoLibrary';

function hasConsentCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie
    .split(';')
    .some((part) => part.trim().startsWith('ngram_demo_consent='));
}


export type AppMode = 'demo' | 'chat' | null;
export type InferenceMode = 'stateless' | 'stateful';
export type AvailabilityState = 'offline' | 'open' | 'code-required';
export type ArcPhase =
  | 'idle'        // pre-landing, before user chooses demo/chat
  | 'intro'       // landing + setup beat
  | 'composing'   // user message appeared in chat pane (right); JSON on left still shows prior turn
  | 'streaming'   // single stream drives both panes: JSON prefill → response, chat thinking → bubble
  | 'settled'     // both panes complete, beat before next turn
  | 'peaking'     // final turn complete, pre-reveal dramatic hold
  | 'revealing'   // stateful reveal animation in flight
  | 'post-arc';   // done; user can replay / chat / toggle modes

/**
 * Sub-phases of the stateful reveal — the punchline animation. These are
 * sequenced by the StatefulReveal component itself but exposed to the
 * store so other components (HUD, ReReadStage) can react to each beat.
 */
export type RevealStep =
  | 'idle'              // not currently revealing
  | 'flash'             // HUD big-number flash (~160ms)
  | 'collapsing'        // JSON column vacuums up toward upper-left (~900ms)
  | 'sweep'             // signature-gradient diagonal sweep across viewport (~400ms)
  | 'chroma'            // chromatic-aberration text flash (~240ms)
  | 'compact-streaming' // tiny compact packet streams into the cleared pane (~700ms)
  | 'badge'             // STATEFUL chip + Manrope display headline drops in
  | 'finalized';        // reveal complete; settled state, awaiting transition to post-arc

interface ArcState {
  // --- App-level state ---
  appMode: AppMode;
  inferenceMode: InferenceMode;
  /** The inference mode that was active when the most recent chat turn was sent.
   * Stays locked after send so toggling the UI toggle mid-conversation doesn't
   * change the JSON payload visualization and trigger a useStreamText replay. */
  chatPayloadMode: InferenceMode;

  // --- Demo catalog ---
  catalog: DemoMeta[];
  activeDemoKey: string;
  activeDemo: DemoMeta | null;

  // --- Arc state machine ---
  phase: ArcPhase;
  currentTurn: number;      // 0-indexed; 0 means "no turns have played yet"
  totalTurns: number;       // from activeDemo, capped
  turnsCap: number;         // caps arc at this many turns (default 8)

  // --- Cross-pane stream sync ---
  // The left-pane stream is the SINGLE source of truth. Chat pane mirrors
  // via these shared values so assistant bubble appears in lock-step with
  // the JSON stream crossing the response boundary.
  streamedChars: number;    // how many chars of the current turn's stream text are visible
  responseBoundary: number; // index in stream text where assistant response begins (thinking-dots → bubble swap)

  // --- Stateful reveal sub-state ---
  revealStep: RevealStep;

  // --- Consent state ---
  consented: boolean;
  setConsented: (consented: boolean) => void;

  // --- Availability state ---
  availabilityState: AvailabilityState;
  setAvailabilityState: (state: AvailabilityState) => void;

  // --- Local debug controls ---
  debugHoldStateless: boolean;

  // --- Actions ---
  setAppMode: (mode: AppMode) => void;
  setInferenceMode: (mode: InferenceMode) => void;
  setChatPayloadMode: (mode: InferenceMode) => void;
  setCatalog: (catalog: DemoMeta[]) => void;
  setActiveDemo: (key: string, demo: DemoMeta) => void;
  setPhase: (phase: ArcPhase) => void;
  setTurn: (turn: number) => void;
  advanceTurn: () => void;
  resetArc: () => void;
  setStreamProgress: (chars: number) => void;
  setResponseBoundary: (idx: number) => void;
  setRevealStep: (step: RevealStep) => void;
  setDebugHoldStateless: (hold: boolean) => void;
}

export const useArcStore = create<ArcState>((set, get) => ({
  appMode: null,
  inferenceMode: 'stateless',
  chatPayloadMode: 'stateless',

  catalog: [],
  activeDemoKey: DEFAULT_DEMO_KEY,
  activeDemo: null,

  phase: 'idle',
  currentTurn: 0,
  totalTurns: 0,
  turnsCap: 8,

  streamedChars: 0,
  responseBoundary: Number.MAX_SAFE_INTEGER,

  revealStep: 'idle',

  consented: hasConsentCookie(),
  setConsented: (consented) => set({ consented }),

  availabilityState: 'offline',
  setAvailabilityState: (availabilityState) => set({ availabilityState }),

  debugHoldStateless: true,

  setAppMode: (mode) => set({ appMode: mode }),
  setInferenceMode: (mode) => set({ inferenceMode: mode }),
  setChatPayloadMode: (mode) => set({ chatPayloadMode: mode }),

  setCatalog: (catalog) => set({ catalog }),
  setActiveDemo: (key, demo) =>
    set({
      activeDemoKey: key,
      activeDemo: demo,
      totalTurns: Math.min(demo.turnCount, get().turnsCap),
      currentTurn: 0,
      phase: 'intro',
    }),

  setPhase: (phase) => set({ phase }),
  setTurn: (turn) => set({ currentTurn: turn }),
  advanceTurn: () =>
    set((s) => {
      const next = s.currentTurn + 1;
      if (next > s.totalTurns) {
        return { currentTurn: s.totalTurns, phase: 'peaking' };
      }
      return { currentTurn: next };
    }),

  resetArc: () =>
    set((s) => ({
      currentTurn: 0,
      phase: s.activeDemo ? 'intro' : 'idle',
      inferenceMode: 'stateless',
      streamedChars: 0,
      responseBoundary: Number.MAX_SAFE_INTEGER,
      revealStep: 'idle',
    })),

  setStreamProgress: (chars) => set({ streamedChars: chars }),
  setResponseBoundary: (idx) => set({ responseBoundary: idx }),
  setRevealStep: (step) => set({ revealStep: step }),
  setDebugHoldStateless: (hold) => set({ debugHoldStateless: hold }),
}));

// Dev-only: expose store on window for browser-console debugging.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  // @ts-expect-error - debug-only handle
  window.__arc = useArcStore;
}

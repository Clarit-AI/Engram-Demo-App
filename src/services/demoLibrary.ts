/**
 * demoLibrary.ts
 *
 * Discovers available demo conversations under /public/demos/*.json and
 * exposes a typed catalog. Adding new demos is zero-config: drop a file in
 * /public/demos/ that matches the shape and it shows up in the rotation.
 *
 * The shape we accept matches the existing export format from clarit.ai
 * (see types.ts → DemoConversation): conversation.messages[] is the source
 * of truth. We do NOT rely on any precomputed turnPayloads — each turn's
 * wire payload is reconstructed at runtime by slicing messages[0..2n+1].
 * This keeps the dramatization faithful to what would actually be sent on
 * the wire and avoids stale/duplicated state.
 */

export interface DemoMeta {
  /** Stable key derived from filename (slug) */
  key: string;
  /** Human-readable title pulled from conversation.title */
  title: string;
  /** Model recorded in the export */
  model: string;
  /** Number of user→assistant exchanges (turns) */
  turnCount: number;
  /** Raw messages array (user/assistant/system) in conversation order */
  messages: DemoMessage[];
}

export interface DemoMessage {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  tokenCount?: number;
}

interface RawDemoFile {
  conversation?: {
    id?: string;
    title?: string;
    model?: string;
    messages?: DemoMessage[];
  };
  // legacy flat shape guard
  id?: string;
  title?: string;
  model?: string;
  messages?: DemoMessage[];
}

/**
 * List of bundled demos. We keep this explicit (not a glob) because Vite
 * serves /public/ statically — fetching is fine, but we want to know the
 * catalog synchronously for UI purposes.
 *
 * To add a demo: drop the file in public/demos/ and append its slug here.
 */
const BUNDLED_DEMO_FILES: Array<{ key: string; file: string }> = [
  { key: 'belair', file: '/demos/nvidia-belair.json' },
  { key: 'mythology-rome', file: '/demos/demo-roman-mythology.json' },
  { key: 'mythology-greek', file: '/demos/demo-mythology.json' },
  { key: 'conversation-long', file: '/demos/conversation.json' },
];

/**
 * Normalize a raw JSON file (either the nested `{conversation: {...}}`
 * shape or a flat shape) into a DemoMeta.
 */
function normalize(key: string, raw: RawDemoFile): DemoMeta | null {
  const conv = raw.conversation ?? {
    id: raw.id,
    title: raw.title,
    model: raw.model,
    messages: raw.messages,
  };
  if (!conv.messages || conv.messages.length === 0) return null;

  // Count turns (user-initiated exchanges)
  const userMsgs = conv.messages.filter((m) => m.role === 'user');

  return {
    key,
    title: conv.title?.trim().split('\n')[0] ?? key,
    model: conv.model ?? 'unknown-model',
    turnCount: userMsgs.length,
    messages: conv.messages,
  };
}

/**
 * Fetch and parse a demo file. Returns null if missing or malformed.
 */
export async function loadDemo(key: string): Promise<DemoMeta | null> {
  const entry = BUNDLED_DEMO_FILES.find((f) => f.key === key);
  if (!entry) return null;
  try {
    const res = await fetch(entry.file);
    if (!res.ok) return null;
    const raw = (await res.json()) as RawDemoFile;
    return normalize(key, raw);
  } catch {
    return null;
  }
}

/**
 * Load the full catalog. Runs in parallel.
 * Filters out any that fail to load or normalize.
 */
export async function loadCatalog(): Promise<DemoMeta[]> {
  const loaded = await Promise.all(
    BUNDLED_DEMO_FILES.map((entry) => loadDemo(entry.key)),
  );
  return loaded.filter((d): d is DemoMeta => d !== null);
}

/**
 * Default rotation key — the demo that plays on first landing.
 */
export const DEFAULT_DEMO_KEY = 'belair';

/**
 * Cap any demo to N turns so the arc has a predictable climax.
 * Returns a truncated messages array that preserves conversation integrity
 * (ends on an assistant response, not mid-turn).
 */
export function capDemoToTurns(messages: DemoMessage[], maxTurns: number): DemoMessage[] {
  // System prompt (if present) stays.
  const sys = messages.filter((m) => m.role === 'system');
  const convo = messages.filter((m) => m.role !== 'system');

  // Pairs: [user, assistant][]
  const pairs: DemoMessage[][] = [];
  for (let i = 0; i < convo.length; i += 2) {
    const user = convo[i];
    const asst = convo[i + 1];
    if (user?.role === 'user' && asst?.role === 'assistant') {
      pairs.push([user, asst]);
    } else {
      // Malformed — stop
      break;
    }
  }
  const clipped = pairs.slice(0, maxTurns).flat();
  return [...sys, ...clipped];
}

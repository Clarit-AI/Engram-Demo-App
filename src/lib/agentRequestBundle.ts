export type AgentRequestMode = 'stateless' | 'stateful';
export type AgentRequestRole = 'system' | 'user' | 'assistant' | 'context';

export interface AgentRequestSection {
  id: string;
  role: AgentRequestRole;
  label: string;
  content: string;
  tokenCount: number;
  isDelta: boolean;
}

export interface AgentRequestBundle {
  turn: number;
  mode: AgentRequestMode;
  sections: AgentRequestSection[];
  totalTokens: number;
  contextId?: string;
}

interface SourceMessage {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenCount?: number;
}

export function estimateRequestTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function sectionFromMessage(
  message: SourceMessage,
  index: number,
  label: string,
  isDelta = false,
): AgentRequestSection {
  return {
    id: message.id ?? `${message.role}-${index}`,
    role: message.role,
    label,
    content: message.content,
    tokenCount: message.tokenCount ?? estimateRequestTokens(message.content),
    isDelta,
  };
}

function finishBundle(
  turn: number,
  mode: AgentRequestMode,
  sections: AgentRequestSection[],
  contextId?: string,
): AgentRequestBundle {
  return {
    turn,
    mode,
    sections,
    totalTokens: sections.reduce((sum, section) => sum + section.tokenCount, 0),
    contextId,
  };
}

export function buildStatelessAgentRequestBundle(
  messages: SourceMessage[],
  turn: number,
): AgentRequestBundle {
  const sys = messages.filter((message) => message.role === 'system');
  const convo = messages.filter((message) => message.role !== 'system');
  const slice = convo.slice(0, Math.max(0, 2 * turn - 1));
  const latestUserIndex = (() => {
    for (let i = slice.length - 1; i >= 0; i -= 1) {
      if (slice[i]?.role === 'user') return i;
    }
    return -1;
  })();

  const sections: AgentRequestSection[] = [
    ...sys.map((message, index) =>
      sectionFromMessage(message, index, 'system instruction'),
    ),
    ...slice.map((message, index) => {
      const turnNumber = Math.floor(index / 2) + 1;
      const label =
        message.role === 'user'
          ? `user message ${turnNumber}`
          : `assistant reply ${turnNumber}`;
      return sectionFromMessage(message, index, label, index === latestUserIndex);
    }),
  ];

  return finishBundle(turn, 'stateless', sections);
}

export function buildStatefulAgentRequestBundle(
  messages: SourceMessage[],
  turn: number,
  contextId: string,
): AgentRequestBundle {
  const convo = messages.filter((message) => message.role !== 'system');
  const userTurns = convo.filter((message) => message.role === 'user');
  const latestUser = userTurns[Math.max(0, turn - 1)] ?? userTurns[userTurns.length - 1];

  const sections: AgentRequestSection[] = [
    {
      id: `context-${contextId}`,
      role: 'context',
      label: 'cached conversation pointer',
      content: contextId,
      tokenCount: estimateRequestTokens(contextId) + 8,
      isDelta: false,
    },
  ];

  if (latestUser) {
    sections.push(sectionFromMessage(latestUser, turn, `latest user message ${turn}`, true));
  }

  return finishBundle(turn, 'stateful', sections, contextId);
}

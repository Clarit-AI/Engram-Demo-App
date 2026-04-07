// === Shared Types for Clarit.ai Demo Chat v2 ===

export type LLMMode = 'stateless' | 'stateful';
export type AppMode = 'demo' | 'chat' | null;

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokenCount: number;
  timestamp: number;
}

export interface TurnPayload {
  id: string;
  request: {
    body: {
      model: string;
      messages: Array<{ role: string; content: string }>;
      stream: boolean;
      contextId?: string;
    };
    tokenCount: number;
    timestamp: number;
  };
  response: {
    body: string;
    duration: number;
    tokenCount: number;
  } | null;
  redundantTokens: number;
  newTokens: number;
  isStreaming: boolean;
  timestamp: number;
}

// Demo conversation format (pre-recorded JSON)
export interface DemoConversation {
  conversation: {
    id: string;
    title: string;
    messages: Array<{
      id: string;
      role: 'system' | 'user' | 'assistant';
      content: string;
      timestamp: number;
      tokenCount?: number;
    }>;
    mode: 'stateless';
    model: string;
  };
  turnPayloads: Array<{
    request: {
      body: {
        model: string;
        messages: Array<{ role: string; content: string }>;
      };
      tokenCount: number;
    };
    response: {
      body: string;
      duration: number;
      tokenCount: number;
    };
    redundantTokens: number;
    newTokens: number;
  }>;
}

export interface LLMProvider {
  readonly mode: LLMMode;
  sendMessage(params: SendMessageParams): Promise<string>;
  getRequestPayload(messages: Message[], model: string, contextId?: string): TurnPayload['request'];
  abort(): void;
  isStreaming(): boolean;
}

export interface SendMessageParams {
  messages: Message[];
  model: string;
  contextId?: string;
  onToken?: (token: string) => void;
  onComplete?: (response: string, metadata: { latencyMs: number; tokenCount: number }) => void;
  onError?: (error: Error) => void;
}

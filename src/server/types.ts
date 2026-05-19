export type ProviderMode =
  | 'stateless-openrouter'
  | 'simulated-engram'
  | 'stateful-engram';

export type LegacyProviderMode = 'stateless' | 'stateful';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessageInput {
  id?: string;
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  mode?: ProviderMode | LegacyProviderMode;
  messages?: ChatMessageInput[];
  model?: string;
  conversationId?: string;
  turnNumber?: number;
}

export interface ChatServerEnv {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  ENGRAM_BASE_URL?: string;
  ENGRAM_API_KEY?: string;
  ENGRAM_ADMIN_API_KEY?: string;
  ENGRAM_MODEL?: string;
  DEFAULT_STATELESS_MODEL?: string;
  DEFAULT_PROVIDER_MODE?: ProviderMode;
}

export interface ChatProviderMetadata {
  providerMode: ProviderMode;
  model: string;
  conversationId?: string;
  turnNumber?: number;
  requestShape: 'full-history' | 'engram-delta';
  sentMessageCount: number;
  canonicalMessageCount: number;
  estimatedInputTokens: number;
  engram?: {
    simulated?: boolean;
    compatibilityResult?: string;
    fallbackReason?: string;
    snapshotSaved?: boolean;
    snapshotId?: string;
    reusedTokenCount?: number;
    continuationTokenCount?: number;
  };
}

export interface ChatSseDelta {
  text: string;
}

export interface ChatSseError {
  message: string;
}

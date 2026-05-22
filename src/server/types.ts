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
  codeType?: string;
}

export interface ChatServerEnv {
  STATELESS_PROVIDER?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  NVIDIA_NIM_API_KEY?: string;
  NVIDIA_NIM_BASE_URL?: string;
  NVIDIA_NIM_MODEL?: string;
  ENGRAM_BASE_URL?: string;
  ENGRAM_API_KEY?: string;
  ENGRAM_ADMIN_API_KEY?: string;
  ENGRAM_MODEL?: string;
  DEFAULT_STATELESS_MODEL?: string;
  DEFAULT_PROVIDER_MODE?: ProviderMode;
  DIGITALOCEAN_MODEL_ACCESS_KEY?: string;
  DIGITALOCEAN_TOKEN?: string;
  DIGITALOCEAN_INFERENCE_BASE_URL?: string;
  DIGITALOCEAN_INFERENCE_MODEL?: string;
  COMPARATIVE_RECORDING_ENABLED?: string;
  COMPARATIVE_RECORDING_MODEL?: string;
  COMPARATIVE_RECORDING_RESTORE_MEASUREMENT?: 'provider-metadata' | 'explicit-restore';
  RATE_LIMIT_ENABLED?: string;
  RATE_LIMIT_DEBUG?: string;
  SESSION_DEBUG?: string;
  SESSION_COOKIE_NAME?: string;
  SESSION_COOKIE_SECURE?: string;
  SESSION_TTL_SECONDS?: string;
  HEARTBEAT_TTL_SECONDS?: string;
  MAX_ACTIVE_SESSIONS?: string;
  MAX_GLOBAL_CONCURRENT_GENERATIONS?: string;
  MAX_SESSION_CONCURRENT_GENERATIONS?: string;
  MAX_REQUESTS_PER_SESSION_PER_MINUTE?: string;
  MAX_REQUESTS_PER_IP_PER_MINUTE?: string;
  MAX_INPUT_TOKENS_PER_REQUEST?: string;
  SESSION_QUEUE_DEPTH?: string;
  SESSION_QUEUE_TIMEOUT_MS?: string;
  INVITE_CODES?: string;
  LIVE_SCHEDULE_ADHOC_WINDOWS?: string;
  RECORDING_EXPORT_SERVER_ENABLED?: string;
  RECORDING_EXPORT_DIR?: string;
  OVH_APPLICATION_KEY?: string;
  OVH_APPLICATION_SECRET?: string;
  OVH_CONSUMER_KEY?: string;
  OVH_ENDPOINT?: string;
  OVH_INSTANCE_IMAGE?: string;
  OVH_INSTANCE_REGION?: string;
}

export interface SessionMetadata {
  idPreview: string;
  active: boolean;
  createdAt: string;
  lastSeen: string;
  expiresAt: string;
  inFlight: number;
  requestsThisMinute: number;
}

export interface RateLimitMetadata {
  enabled: boolean;
  activeSessions: number;
  globalInFlight: number;
  sessionInFlight: number;
  requestsThisMinute: number;
  maxRequestsPerMinute: number;
  maxSessionConcurrent: number;
  maxGlobalConcurrent: number;
  estimatedInputTokens?: number;
  providerMode?: ProviderMode | LegacyProviderMode;
  queueDepth?: number;
  provisionState?: string;
}

export interface ChatProviderMetadata {
  providerMode: ProviderMode;
  statelessProvider?: 'openrouter' | 'nvidia-nim';
  model: string;
  conversationId?: string;
  turnNumber?: number;
  requestShape: 'full-history' | 'engram-delta';
  sentMessageCount: number;
  canonicalMessageCount: number;
  estimatedInputTokens: number;
  session?: SessionMetadata;
  rateLimit?: RateLimitMetadata;
  engram?: {
    simulated?: boolean;
    compatibilityResult?: string;
    fallbackReason?: string;
    snapshotSaved?: boolean;
    snapshotId?: string;
    reusedTokenCount?: number;
    continuationTokenCount?: number;
    restoreLatencyMs?: number;
    snapshotSizeBytes?: number;
    snapshotSizeMb?: number;
  };
}

export interface ChatSseDelta {
  text: string;
}

export interface ChatSseError {
  message: string;
}
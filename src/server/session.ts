import type {
  ChatMessageInput,
  ChatRequestBody,
  ChatServerEnv,
  RateLimitMetadata,
  SessionMetadata,
} from './types';

type RateLimitDecision =
  | {
      ok: true;
      session: SessionRecord;
      metadata: RateLimitMetadata;
      headers: Record<string, string>;
      release: () => void;
    }
  | {
      ok: false;
      status: number;
      body: {
        error: string;
        code: string;
        retryAfterSeconds?: number;
        session?: SessionMetadata;
        rateLimit?: RateLimitMetadata;
      };
      headers: Record<string, string>;
    };

interface SessionRecord {
  id: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  ip: string;
  userAgent: string;
  inFlight: number;
  requestTimestamps: number[];
  estimatedTokens: number;
}

interface IpBucket {
  requestTimestamps: number[];
  lastSeen: number;
}

interface RateLimitConfig {
  enabled: boolean;
  cookieName: string;
  sessionTtlSeconds: number;
  heartbeatTtlSeconds: number;
  maxActiveSessions: number;
  maxGlobalConcurrentGenerations: number;
  maxSessionConcurrentGenerations: number;
  maxRequestsPerSessionPerMinute: number;
  maxRequestsPerIpPerMinute: number;
  maxInputTokensPerRequest: number;
}

const sessions = new Map<string, SessionRecord>();
const ipBuckets = new Map<string, IpBucket>();

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  return fallback;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRateLimitConfig(env: ChatServerEnv): RateLimitConfig {
  return {
    enabled: parseBoolean(env.RATE_LIMIT_ENABLED, true),
    cookieName: env.SESSION_COOKIE_NAME || 'ngram_demo_session',
    sessionTtlSeconds: parsePositiveInt(env.SESSION_TTL_SECONDS, 60 * 60),
    heartbeatTtlSeconds: parsePositiveInt(env.HEARTBEAT_TTL_SECONDS, 90),
    maxActiveSessions: parsePositiveInt(env.MAX_ACTIVE_SESSIONS, 24),
    maxGlobalConcurrentGenerations: parsePositiveInt(
      env.MAX_GLOBAL_CONCURRENT_GENERATIONS,
      2,
    ),
    maxSessionConcurrentGenerations: parsePositiveInt(
      env.MAX_SESSION_CONCURRENT_GENERATIONS,
      1,
    ),
    maxRequestsPerSessionPerMinute: parsePositiveInt(
      env.MAX_REQUESTS_PER_SESSION_PER_MINUTE,
      6,
    ),
    maxRequestsPerIpPerMinute: parsePositiveInt(env.MAX_REQUESTS_PER_IP_PER_MINUTE, 18),
    maxInputTokensPerRequest: parsePositiveInt(env.MAX_INPUT_TOKENS_PER_REQUEST, 12_000),
  };
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function estimateMessagesTokens(messages: ChatMessageInput[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [rawName, ...rest] = part.trim().split('=');
    if (!rawName || rest.length === 0) return cookies;
    cookies[rawName] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
}

function isValidSessionId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{16,96}$/.test(value);
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replaceAll('-', '');
  }

  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'local';
}

function getUserAgent(request: Request): string {
  return request.headers.get('user-agent')?.slice(0, 180) || 'unknown';
}

function shouldUseSecureCookie(request: Request, env: ChatServerEnv): boolean {
  if (env.SESSION_COOKIE_SECURE) {
    return parseBoolean(env.SESSION_COOKIE_SECURE, true);
  }
  return new URL(request.url).protocol === 'https:';
}

function makeSessionCookie(
  request: Request,
  env: ChatServerEnv,
  config: RateLimitConfig,
  sessionId: string,
): string {
  const parts = [
    `${config.cookieName}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    `Max-Age=${config.sessionTtlSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (shouldUseSecureCookie(request, env)) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function pruneOldTimestamps(timestamps: number[], now: number): number[] {
  return timestamps.filter((ts) => now - ts < 60_000);
}

function cleanup(now: number, config: RateLimitConfig) {
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }

  for (const [ip, bucket] of ipBuckets) {
    bucket.requestTimestamps = pruneOldTimestamps(bucket.requestTimestamps, now);
    if (bucket.requestTimestamps.length === 0 && now - bucket.lastSeen > 5 * 60_000) {
      ipBuckets.delete(ip);
    }
  }

  for (const session of sessions.values()) {
    session.requestTimestamps = pruneOldTimestamps(session.requestTimestamps, now);
    if (now - session.lastSeen > config.heartbeatTtlSeconds * 1000) {
      session.inFlight = Math.max(0, session.inFlight);
    }
  }
}

function activeSessionCount(now: number, config: RateLimitConfig): number {
  let count = 0;
  for (const session of sessions.values()) {
    if (now - session.lastSeen <= config.heartbeatTtlSeconds * 1000) count += 1;
  }
  return count;
}

function globalInFlight(): number {
  let count = 0;
  for (const session of sessions.values()) count += session.inFlight;
  return count;
}

function toSessionMetadata(session: SessionRecord, now: number): SessionMetadata {
  return {
    idPreview: session.id.slice(0, 8),
    active: now < session.expiresAt,
    createdAt: new Date(session.createdAt).toISOString(),
    lastSeen: new Date(session.lastSeen).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    inFlight: session.inFlight,
    requestsThisMinute: session.requestTimestamps.length,
  };
}

function buildRateLimitMetadata(
  session: SessionRecord,
  config: RateLimitConfig,
  now: number,
): RateLimitMetadata {
  return {
    enabled: config.enabled,
    activeSessions: activeSessionCount(now, config),
    globalInFlight: globalInFlight(),
    sessionInFlight: session.inFlight,
    requestsThisMinute: session.requestTimestamps.length,
    maxRequestsPerMinute: config.maxRequestsPerSessionPerMinute,
    maxSessionConcurrent: config.maxSessionConcurrentGenerations,
    maxGlobalConcurrent: config.maxGlobalConcurrentGenerations,
  };
}

export function ensureSession(
  request: Request,
  env: ChatServerEnv,
): { session: SessionRecord; setCookie: string; config: RateLimitConfig; isNew: boolean } {
  const config = getRateLimitConfig(env);
  const now = Date.now();
  cleanup(now, config);

  const cookies = parseCookies(request.headers.get('cookie'));
  const candidateId = cookies[config.cookieName];
  const existing = isValidSessionId(candidateId) ? sessions.get(candidateId) : undefined;
  const id = existing?.id || (isValidSessionId(candidateId) ? candidateId : createSessionId());
  const isNew = !existing;
  const session: SessionRecord = existing || {
    id,
    createdAt: now,
    lastSeen: now,
    expiresAt: now + config.sessionTtlSeconds * 1000,
    ip: getClientIp(request),
    userAgent: getUserAgent(request),
    inFlight: 0,
    requestTimestamps: [],
    estimatedTokens: 0,
  };

  session.lastSeen = now;
  session.expiresAt = now + config.sessionTtlSeconds * 1000;
  session.ip = getClientIp(request);
  session.userAgent = getUserAgent(request);
  sessions.set(session.id, session);

  return {
    session,
    setCookie: makeSessionCookie(request, env, config, session.id),
    config,
    isNew,
  };
}

export function reserveChatCapacity(
  request: Request,
  env: ChatServerEnv,
  body: ChatRequestBody,
  messages: ChatMessageInput[],
): RateLimitDecision {
  const now = Date.now();
  const { session, setCookie, config, isNew } = ensureSession(request, env);
  const ip = getClientIp(request);
  const bucket = ipBuckets.get(ip) || { requestTimestamps: [], lastSeen: now };
  bucket.lastSeen = now;
  bucket.requestTimestamps = pruneOldTimestamps(bucket.requestTimestamps, now);
  ipBuckets.set(ip, bucket);

  session.requestTimestamps = pruneOldTimestamps(session.requestTimestamps, now);
  const estimatedInputTokens = estimateMessagesTokens(messages);
  const sessionMeta = toSessionMetadata(session, now);
  const headers = {
    'set-cookie': setCookie,
    'x-clarit-session': sessionMeta.idPreview,
    'x-clarit-rate-limit-enabled': String(config.enabled),
  };

  const reject = (
    code: string,
    error: string,
    retryAfterSeconds = 30,
    status = 429,
  ): RateLimitDecision => ({
    ok: false,
    status,
    body: {
      error,
      code,
      retryAfterSeconds,
      session: sessionMeta,
      rateLimit: buildRateLimitMetadata(session, config, now),
    },
    headers: {
      ...headers,
      'retry-after': String(retryAfterSeconds),
    },
  });

  if (!config.enabled) {
    const metadata = buildRateLimitMetadata(session, config, now);
    return {
      ok: true,
      session,
      metadata,
      headers,
      release: () => undefined,
    };
  }

  if (isNew && activeSessionCount(now, config) > config.maxActiveSessions) {
    return reject(
      'active_sessions_exceeded',
      'The live demo is at its active session limit. Please try again shortly.',
    );
  }

  if (estimatedInputTokens > config.maxInputTokensPerRequest) {
    return reject(
      'input_tokens_exceeded',
      'That request is larger than the current live demo token limit.',
      60,
      413,
    );
  }

  if (globalInFlight() >= config.maxGlobalConcurrentGenerations) {
    return reject(
      'global_concurrency_exceeded',
      'The live model is busy with other generations. Please try again shortly.',
    );
  }

  if (session.inFlight >= config.maxSessionConcurrentGenerations) {
    return reject(
      'session_concurrency_exceeded',
      'This session already has a generation in progress.',
    );
  }

  if (session.requestTimestamps.length >= config.maxRequestsPerSessionPerMinute) {
    return reject(
      'session_rate_exceeded',
      'This session has reached the current live demo request limit.',
    );
  }

  if (bucket.requestTimestamps.length >= config.maxRequestsPerIpPerMinute) {
    return reject(
      'ip_rate_exceeded',
      'This network has reached the current live demo request limit.',
    );
  }

  session.inFlight += 1;
  session.requestTimestamps.push(now);
  session.estimatedTokens += estimatedInputTokens;
  bucket.requestTimestamps.push(now);

  const metadata = {
    ...buildRateLimitMetadata(session, config, now),
    estimatedInputTokens,
    providerMode: body.mode,
  };

  return {
    ok: true,
    session,
    metadata,
    headers,
    release: () => {
      session.inFlight = Math.max(0, session.inFlight - 1);
      session.lastSeen = Date.now();
    },
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export async function handleSessionRequest(
  request: Request,
  env: ChatServerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': request.headers.get('origin') || '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
      },
    });
  }

  if (url.pathname !== '/api/session' && url.pathname !== '/api/session/heartbeat') {
    return jsonResponse({ error: 'Unknown session endpoint.' }, 404);
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return jsonResponse({ error: 'Unsupported session method.' }, 405);
  }

  const now = Date.now();
  const { session, setCookie, config } = ensureSession(request, env);
  const metadata = buildRateLimitMetadata(session, config, now);

  return jsonResponse(
    {
      session: toSessionMetadata(session, now),
      rateLimit: metadata,
      cookieRequired: true,
      debug: parseBoolean(env.SESSION_DEBUG, false),
    },
    200,
    {
      'set-cookie': setCookie,
      'access-control-allow-origin': request.headers.get('origin') || '*',
      'access-control-allow-credentials': 'true',
    },
  );
}

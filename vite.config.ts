import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { initDb } from './src/server/db';
import { initProvisionStateFromDb } from './src/server/ovhProvision';
import { handleChatRequest } from './src/server/chatHandler'
import { handleComparativeRecordingRequest } from './src/server/comparativeRecorder'
import { handleSessionRequest } from './src/server/session'
import { handleRedeemRequest, handleScheduleAdminRequest } from './src/server/redeemHandler'
import { initScheduleFromEnv } from './src/server/schedule'
import { startEngramHealthMonitor } from './src/server/engramHealth'
import { parseInviteCodes } from './src/server/codes'
import type { ChatServerEnv } from './src/server/types'

async function readBody(req: import('node:http').IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function requestFromNode(
  req: import('node:http').IncomingMessage & { originalUrl?: string },
  body: Buffer,
) {
  const origin = `http://${req.headers.host ?? '127.0.0.1'}`;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers[key] = value.join(', ');
    else if (value !== undefined) headers[key] = value;
  }

  return new Request(`${origin}${req.originalUrl ?? req.url ?? '/api/chat'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

async function writeResponse(
  res: import('node:http').ServerResponse,
  response: Response,
) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  // Disable Nagle and flush headers immediately so SSE token chunks reach
  // the browser without waiting for the TCP stack to fill a full packet.
  (res.socket as { setNoDelay?: (v: boolean) => void } | null)?.setNoDelay?.(true);
  res.flushHeaders();

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
    // Push through any compression middleware that buffers before sending.
    (res as unknown as { flush?: () => void }).flush?.();
  }
  res.end();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function serverRecordingExportEnabled(env: ChatServerEnv): boolean {
  return env.RECORDING_EXPORT_SERVER_ENABLED === 'true';
}

function publicStatelessProvider(value: unknown): string {
  const provider = typeof value === 'string' ? value.toLowerCase() : '';
  if (provider === 'nvidia' || provider === 'nvidia-nim' || provider === 'nim') return 'nvidia-nim';
  if (provider === 'openrouter') return 'openrouter';
  return '';
}

function sanitizeFilename(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim() : 'simulation-playback.json';
  const normalized = path.normalize(candidate);

  if (
    candidate.length === 0 ||
    path.isAbsolute(candidate) ||
    normalized.startsWith('..') ||
    normalized.includes(`..${path.sep}`) ||
    candidate.includes('..') ||
    candidate !== path.basename(candidate) ||
    !/^[a-zA-Z0-9._-]+$/.test(candidate)
  ) {
    throw new Error('Recording export filename must use only letters, numbers, dot, underscore, or dash.');
  }

  return candidate.endsWith('.json') ? candidate : `${candidate}.json`;
}

async function handleRecordingExportRequest(
  request: Request,
  env: ChatServerEnv,
) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Unsupported recording export method.' }, 405);
  }

  if (!serverRecordingExportEnabled(env)) {
    return jsonResponse({ error: 'Server recording export is not enabled.' }, 403);
  }

  let body: { filename?: unknown; payload?: unknown };
  try {
    body = (await request.json()) as { filename?: unknown; payload?: unknown };
  } catch {
    return jsonResponse({ error: 'Recording export requires a JSON body.' }, 400);
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return jsonResponse({ error: 'Recording export requires a payload object.' }, 400);
  }

  const dir = path.resolve(process.cwd(), env.RECORDING_EXPORT_DIR || '.agent/recordings');
  let filename: string;
  try {
    filename = sanitizeFilename(body.filename);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid recording export filename.';
    return jsonResponse({ error: message }, 400);
  }
  const target = path.join(dir, filename);

  await mkdir(dir, { recursive: true });
  await writeFile(target, `${JSON.stringify(body.payload, null, 2)}\n`, 'utf8');

  return jsonResponse({ ok: true, path: target, filename });
}

export default defineConfig(({ mode }) => {
  const serverEnv = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  } as ChatServerEnv;

  return {
    define: {
      'import.meta.env.VITE_STATELESS_PROVIDER': JSON.stringify(publicStatelessProvider(serverEnv.STATELESS_PROVIDER)),
    },
    optimizeDeps: {
      include: ['ovh', 'better-sqlite3'],
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'clarit-chat-api',
        configureServer(server) {
          // Catch any unhandled rejections / exceptions that escape individual
          // request handlers so the dev-server process stays alive on Node.js 26.
          process.on('unhandledRejection', (reason) => {
            console.error('[clarit-chat-api] unhandledRejection (suppressed to keep dev server alive):', reason);
          });
          process.on('uncaughtException', (err) => {
            console.error('[clarit-chat-api] uncaughtException (suppressed to keep dev server alive):', err);
          });

          // Wrap each handler so an unhandled rejection (e.g. DB unavailable,
          // native module not built for current Node.js version) returns a 503
          // instead of crashing the Vite dev-server process.
          function safeHandler(
            handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>,
          ) {
            return async (
              req: import('node:http').IncomingMessage,
              res: import('node:http').ServerResponse,
            ) => {
              try {
                await handler(req, res);
              } catch (err) {
                console.error('[clarit-chat-api] unhandled error in middleware:', err);
                if (!res.headersSent) {
                  res.writeHead(503, { 'content-type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Service temporarily unavailable.' }));
                }
              }
            };
          }

          server.middlewares.use('/api/chat', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleChatRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          server.middlewares.use('/api/session', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleSessionRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          server.middlewares.use('/api/recording/export', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleRecordingExportRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          server.middlewares.use('/api/recording/comparative', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleComparativeRecordingRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          server.middlewares.use('/api/redeem', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleRedeemRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          server.middlewares.use('/api/admin/schedule', safeHandler(async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleScheduleAdminRequest(request, serverEnv);
            await writeResponse(res, response);
          }));

          // Initialize schedule, codes, and database from env
          initScheduleFromEnv(serverEnv);
          parseInviteCodes(serverEnv.INVITE_CODES);
          initDb();
          startEngramHealthMonitor(serverEnv);
          try {
            initProvisionStateFromDb();
          } catch {
            // Provision state unavailable (e.g. missing native module) — non-fatal
            // and intentionally silent to avoid noisy dev-server startup failures.
          }
        },
      },
    ],
  };
})
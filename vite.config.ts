import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { handleChatRequest } from './src/server/chatHandler'
import { handleSessionRequest } from './src/server/session'
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

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
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

function sanitizeFilename(value: unknown): string {
  const candidate = typeof value === 'string' ? value : 'simulation-playback.json';
  const base = path.basename(candidate).replace(/[^a-zA-Z0-9._-]/g, '-');
  return base.endsWith('.json') ? base : `${base}.json`;
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
  const filename = sanitizeFilename(body.filename);
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
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'clarit-chat-api',
        configureServer(server) {
          server.middlewares.use('/api/chat', async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleChatRequest(request, serverEnv);
            await writeResponse(res, response);
          });

          server.middlewares.use('/api/session', async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleSessionRequest(request, serverEnv);
            await writeResponse(res, response);
          });

          server.middlewares.use('/api/recording/export', async (req, res) => {
            const request = requestFromNode(req, await readBody(req));
            const response = await handleRecordingExportRequest(request, serverEnv);
            await writeResponse(res, response);
          });
        },
      },
    ],
  };
})

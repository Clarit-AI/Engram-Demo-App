import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from '../src/server/db';
import { initProvisionStateFromDb } from '../src/server/ovhProvision';
import { handleChatRequest } from '../src/server/chatHandler';
import { handleComparativeRecordingRequest } from '../src/server/comparativeRecorder';
import { handleRedeemRequest, handleScheduleAdminRequest } from '../src/server/redeemHandler';
import { handleSessionRequest } from '../src/server/session';
import { initScheduleFromEnv } from '../src/server/schedule';
import { parseInviteCodes } from '../src/server/codes';
import type { ChatServerEnv } from '../src/server/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const indexPath = path.join(distDir, 'index.html');
const env = process.env as ChatServerEnv;

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function requestFromNode(req: IncomingMessage, body: Buffer): Request {
  const protocol = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim() || 'http';
  const host = req.headers.host ?? `127.0.0.1:${process.env.PORT ?? '3000'}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, value);
  }

  return new Request(`${protocol}://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
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

function recordingExportEnabled(): boolean {
  return env.RECORDING_EXPORT_SERVER_ENABLED === 'true';
}

function sanitizeFilename(value: unknown): string {
  const candidate = typeof value === 'string' ? value : 'simulation-playback.json';
  const base = path.basename(candidate).replace(/[^a-zA-Z0-9._-]/g, '-');
  return base.endsWith('.json') ? base : `${base}.json`;
}

async function handleRecordingExportRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Unsupported recording export method.' }, 405);
  }

  if (!recordingExportEnabled()) {
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

async function routeApi(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);

  if (pathname === '/api/chat') return handleChatRequest(request, env);
  if (pathname === '/api/session' || pathname === '/api/session/heartbeat') {
    return handleSessionRequest(request, env);
  }
  if (pathname === '/api/recording/export') return handleRecordingExportRequest(request);
  if (pathname === '/api/recording/comparative') {
    return handleComparativeRecordingRequest(request, env);
  }
  if (pathname === '/api/redeem') return handleRedeemRequest(request, env);
  if (pathname === '/api/admin/schedule' || pathname === '/api/admin/schedule/add') {
    return handleScheduleAdminRequest(request, env);
  }

  if (pathname.startsWith('/api/')) {
    return jsonResponse({ error: 'Unknown API endpoint.' }, 404);
  }

  return null;
}

async function serveFile(res: ServerResponse, filePath: string, cacheControl: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const fileStat = await stat(filePath);

  res.writeHead(200, {
    'content-type': contentType,
    'content-length': String(fileStat.size),
    'cache-control': cacheControl,
  });

  createReadStream(filePath).pipe(res);
}

async function routeStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const candidate = path.normalize(path.join(distDir, decodedPath));
  const isWithinDist = candidate === distDir || candidate.startsWith(`${distDir}${path.sep}`);
  const filePath = isWithinDist && decodedPath !== '/' ? candidate : indexPath;

  try {
    const file = await stat(filePath);
    if (file.isFile()) {
      await serveFile(
        res,
        filePath,
        filePath.includes(`${path.sep}assets${path.sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=300',
      );
      return;
    }
  } catch {
    // Fall back to the app shell for client-side routes.
  }

  const html = await readFile(indexPath);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(html.byteLength),
    'cache-control': 'no-cache',
  });
  res.end(html);
}

function initializeServerState(): void {
  initScheduleFromEnv(env);
  parseInviteCodes(env.INVITE_CODES);
  initDb();
  try {
    initProvisionStateFromDb();
  } catch {
    // Provision state is optional and should not block serving the demo.
  }
}

initializeServerState();

const server = createServer(async (req, res) => {
  try {
    const request = requestFromNode(req, await readBody(req));
    const apiResponse = await routeApi(request);

    if (apiResponse) {
      await writeResponse(res, apiResponse);
      return;
    }

    await routeStatic(req, res);
  } catch (error) {
    console.error('[clarit-node-server] request failed:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal server error.' }));
  }
});

const port = Number.parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

server.listen(port, host, () => {
  console.log(`[clarit-node-server] listening on http://${host}:${port}`);
});

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
        },
      },
    ],
  };
})

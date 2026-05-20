import { handleChatRequest } from './server/chatHandler';
import { handleSessionRequest } from './server/session';
import type { ChatServerEnv } from './server/types';

type WorkerEnv = ChatServerEnv & {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat') {
      return handleChatRequest(request, env);
    }

    if (url.pathname === '/api/session' || url.pathname === '/api/session/heartbeat') {
      return handleSessionRequest(request, env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

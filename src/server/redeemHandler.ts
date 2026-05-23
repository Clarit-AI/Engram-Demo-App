import { parseInviteCodes, redeemCode } from './codes';
import type { ChatServerEnv } from './types';

let initialized = false;

function ensureInitialized(env: ChatServerEnv): void {
  if (initialized) return;
  initialized = true;
  parseInviteCodes(env.INVITE_CODES);
}

export async function handleRedeemRequest(
  request: Request,
  env: ChatServerEnv,
): Promise<Response> {
  ensureInitialized(env);

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Unsupported method.' }), {
      status: 405,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (!body.code || typeof body.code !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing code field.' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const result = redeemCode(body.code.trim());
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    code: {
      value: result.code!.value,
      label: result.code!.label,
      type: result.code!.type,
    },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function handleScheduleAdminRequest(
  request: Request,
  env: ChatServerEnv,
): Promise<Response> {
  ensureInitialized(env);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const { getScheduleWindows } = await import('./schedule-store');
    const windows = getScheduleWindows();
    return new Response(JSON.stringify({ windows }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (request.method === 'POST' && url.pathname.endsWith('/admin/schedule/add')) {
    let body: { label?: string; start?: string; end?: string; policy?: string };
    try {
      body = (await request.json()) as { label?: string; start?: string; end?: string; policy?: string };
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const startMs = Date.parse(String(body.start));
    const endMs = Date.parse(String(body.end));
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return new Response(JSON.stringify({ error: 'start and end must be valid date values.' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    if (endMs <= startMs) {
      return new Response(JSON.stringify({ error: 'end must be after start.' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const { addScheduleWindow } = await import('./schedule-store');
    const window = addScheduleWindow({
      label: body.label ?? 'Ad-hoc window',
      start: new Date(startMs),
      end: new Date(endMs),
      policy: body.policy === 'code-required' ? 'code-required' : 'open',
    });
    return new Response(JSON.stringify({ window }), {
      status: 201,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id query param.' }), {
        status: 400,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    const { removeScheduleWindow } = await import('./schedule-store');
    const removed = removeScheduleWindow(id);
    return new Response(JSON.stringify({ removed }), {
      status: removed ? 200 : 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unsupported endpoint.' }), {
    status: 404,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
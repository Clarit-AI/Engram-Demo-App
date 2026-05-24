import {
  dbGetProvisionState,
  dbUpsertProvisionState,
  type ProvisionState,
} from './db';
import type { ChatServerEnv } from './types';

// ─── Module-level singleton state ─────────────────────────────────────────────

let currentState: {
  state: ProvisionState;
  endpoint?: string;
  instanceId?: string;
} = { state: 'none' };

let provisioningPromise: Promise<string> | null = null;

// ─── OVH client factory ─────────────────────────────────────────────────────

function createOvhClient(env: ChatServerEnv) {
  const endpoint = env.OVH_ENDPOINT ?? 'ovh-eu';
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const client = (require('ovh') as any)({
    appKey: env.OVH_APPLICATION_KEY!,
    appSecret: env.OVH_APPLICATION_SECRET!,
    consumerKey: env.OVH_CONSUMER_KEY!,
    endpoint,
  });
  return client as {
    request<T>(method: string, path: string, body?: unknown): Promise<T>;
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type OvHProvisionState = {
  state: ProvisionState;
  endpoint?: string;
  instanceId?: string;
};

export function getProvisionState(): OvHProvisionState {
  return { ...currentState };
}

export async function getInstanceStatus(env: ChatServerEnv): Promise<OvHProvisionState> {
  if (currentState.state === 'none' || currentState.state === 'error') {
    return { state: currentState.state };
  }

  if (!currentState.instanceId || !env.OVH_APPLICATION_KEY) {
    return { state: currentState.state };
  }

  try {
    const client = createOvhClient(env);
    const instance = await client.request(
      'GET',
      `/ai-training/instances/${currentState.instanceId}`,
    ) as { state: string; endpoint?: string };

    const newState = mapInstanceState(instance.state);
    currentState = {
      state: newState,
      endpoint: instance.endpoint,
      instanceId: currentState.instanceId,
    };
    dbUpsertProvisionState(newState, instance.endpoint, currentState.instanceId);
    return { ...currentState };
  } catch {
    return { ...currentState };
  }
}

export async function provisionInstance(env: ChatServerEnv): Promise<string> {
  if (!env.OVH_APPLICATION_KEY || !env.OVH_APPLICATION_SECRET || !env.OVH_CONSUMER_KEY) {
    throw new Error('OVH credentials not configured.');
  }

  if (currentState.state === 'running' && currentState.endpoint) {
    return currentState.endpoint;
  }

  if (currentState.state === 'provisioning' && provisioningPromise) {
    return provisioningPromise;
  }

  currentState = { state: 'provisioning' };
  dbUpsertProvisionState('provisioning');
  provisioningPromise = doProvision(env);

  try {
    const endpoint = await provisioningPromise;
    return endpoint;
  } finally {
    provisioningPromise = null;
  }
}

export async function terminateInstance(env: ChatServerEnv): Promise<void> {
  if (currentState.state === 'none') return;
  const savedInstanceId = currentState.instanceId;
  const savedEndpoint = currentState.endpoint;
  if (!savedInstanceId) {
    currentState = { state: 'none' };
    dbUpsertProvisionState('none');
    return;
  }

  currentState = { state: 'terminating' };
  dbUpsertProvisionState('terminating', savedEndpoint, savedInstanceId);

  try {
    const client = createOvhClient(env);
    await client.request('DELETE', `/ai-training/instances/${savedInstanceId}`);
  } catch {
    // Best-effort deletion
  } finally {
    currentState = { state: 'none' };
    dbUpsertProvisionState('none');
  }
}

// ─── Internal provisioning flow ─────────────────────────────────────────────

async function doProvision(env: ChatServerEnv): Promise<string> {
  const client = createOvhClient(env);
  const image = env.OVH_INSTANCE_IMAGE ?? 'nginx:latest';
  const region = env.OVH_INSTANCE_REGION ?? 'sbg1';

  try {
    const result = await client.request('POST', '/ai-training/instances', {
      flavor: 'ai1.4xlarge',
      image,
      region,
      command: '/bin/bash -c "echo ready"',
    }) as { id: string };

    currentState = { state: 'provisioning', instanceId: result.id };
    dbUpsertProvisionState('provisioning', undefined, result.id);

    const endpoint = await waitForInstance(client, result.id);
    currentState = { state: 'running', endpoint, instanceId: result.id };
    dbUpsertProvisionState('running', endpoint, result.id);
    return endpoint;
  } catch (err) {
    currentState = { state: 'error' };
    dbUpsertProvisionState('error');
    throw err;
  }
}

async function waitForInstance(client: ReturnType<typeof createOvhClient>, instanceId: string): Promise<string> {
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes
  const pollIntervalMs = 15_000;     // 15 seconds
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);

    const instance = await client.request(
      'GET',
      `/ai-training/instances/${instanceId}`,
    ) as { state: string; endpoint?: string };

    const mappedState = mapInstanceState(instance.state);

    if (mappedState === 'running' && instance.endpoint) {
      return instance.endpoint;
    }
    if (mappedState === 'error' || mappedState === 'terminating') {
      throw new Error(`Instance ${instanceId} transitioned to ${mappedState} while waiting for ready.`);
    }
  }

  throw new Error(`Instance ${instanceId} did not become ready within ${maxWaitMs / 1000}s.`);
}

function mapInstanceState(raw: string): ProvisionState {
  switch (raw) {
    case 'starting':
    case 'pending':
      return 'provisioning';
    case 'running':
      return 'running';
    case 'stopping':
    case 'terminated':
    case 'terminating':
      return 'terminating';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'provisioning';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Initialize from persisted state on module load ─────────────────────────

export function initProvisionStateFromDb(): void {
  const persisted = dbGetProvisionState();
  if (persisted) {
    currentState = {
      state: persisted.state,
      endpoint: persisted.endpoint,
      instanceId: persisted.instanceId,
    };
  }
}
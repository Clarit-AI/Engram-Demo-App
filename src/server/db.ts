import Database from 'better-sqlite3';
import type { CodeType } from './codes';

export type ProvisionState = 'none' | 'provisioning' | 'running' | 'terminating' | 'error';

type DbInstance = InstanceType<typeof Database>;

let _db: DbInstance | null = null;

export function getDb(): DbInstance {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function initDb(dbPath?: string): void {
  if (_db) return;
  try {
    const p = dbPath ?? './data/sessions.db';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path');
    const dir = path.dirname(p);
    if (dir && dir !== '.') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { mkdirSync } = require('node:fs');
      mkdirSync(dir, { recursive: true });
    }
    _db = new Database(p);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS queue_entries (
      session_id    TEXT PRIMARY KEY,
      enqueued_at   INTEGER NOT NULL,
      code_type     TEXT NOT NULL DEFAULT 'public',
      priority_rank INTEGER NOT NULL DEFAULT 3,
      timeout_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS code_redemptions (
      code_value   TEXT PRIMARY KEY,
      current_uses INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provision_state (
      key         TEXT PRIMARY KEY DEFAULT 'instance',
      state       TEXT NOT NULL DEFAULT 'none',
      endpoint    TEXT,
      instance_id TEXT,
      updated_at  INTEGER NOT NULL
    );
  `);
  } catch {
    // Database unavailable (e.g. missing native module on unsupported platforms).
    // Intentionally silent — getDb() throws on access, isolating the failure.
    _db = null;
    return;
  }
}

// ─── Priority rank mapping ───────────────────────────────────────────────────

const PRIORITY_RANK: Record<CodeType, number> = {
  investor: 1,
  partner:  2,
  public:   3,
};

function priorityRank(codeType: CodeType): number {
  return PRIORITY_RANK[codeType] ?? 3;
}

// ─── Queue operations ────────────────────────────────────────────────────────

export function dbEnqueue(entry: {
  sessionId: string;
  codeType: CodeType;
  enqueuedAt: number;
  timeoutAt: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO queue_entries (session_id, enqueued_at, code_type, priority_rank, timeout_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.sessionId,
    entry.enqueuedAt,
    entry.codeType,
    priorityRank(entry.codeType),
    entry.timeoutAt,
  );
}

export interface DequeuedEntry {
  sessionId: string;
  codeType: CodeType;
  enqueuedAt: number;
}

export function dbDequeue(timeoutBefore: number): DequeuedEntry | null {
  const db = getDb();
  const row = db.prepare(`
    DELETE FROM queue_entries
     WHERE rowid = (
       SELECT rowid FROM queue_entries
        WHERE timeout_at > ?
        ORDER BY priority_rank ASC, enqueued_at ASC
        LIMIT 1
     )
     RETURNING session_id, code_type, enqueued_at
  `).get(timeoutBefore) as { session_id: string; code_type: string; enqueued_at: number } | undefined;

  if (!row) return null;

  return {
    sessionId: row.session_id,
    codeType: row.code_type as CodeType,
    enqueuedAt: row.enqueued_at,
  };
}

export function dbRemoveFromQueue(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM queue_entries WHERE session_id = ?').run(sessionId);
}

export function dbQueueCount(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM queue_entries').get() as { cnt: number };
  return row.cnt;
}

// ─── Code redemption operations ─────────────────────────────────────────────

export function dbInitializeCodeRedemption(codeValue: string): void {
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO code_redemptions (code_value, current_uses) VALUES (?, 0)
  `).run(codeValue);
}

export function dbGetRedemptionCount(codeValue: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT current_uses FROM code_redemptions WHERE code_value = ?'
  ).get(codeValue) as { current_uses: number } | undefined;
  return row?.current_uses ?? 0;
}

export function dbIncrementRedemption(codeValue: string, maxUses?: number): boolean {
  const db = getDb();
  if (maxUses !== undefined) {
    const result = db.prepare(`
      INSERT INTO code_redemptions (code_value, current_uses) VALUES (?, 1)
      ON CONFLICT(code_value) DO UPDATE
        SET current_uses = current_uses + 1
        WHERE current_uses < ?
    `).run(codeValue, maxUses);
    return result.changes > 0;
  }
  db.prepare(`
    INSERT INTO code_redemptions (code_value, current_uses) VALUES (?, 1)
    ON CONFLICT(code_value) DO UPDATE SET current_uses = current_uses + 1
  `).run(codeValue);
  return true;
}

// ─── Provision state operations ─────────────────────────────────────────────

export function dbGetProvisionState(): {
  state: ProvisionState;
  endpoint?: string;
  instanceId?: string;
} | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT state, endpoint, instance_id FROM provision_state WHERE key = ?'
  ).get('instance') as { state: string; endpoint: string | null; instance_id: string | null } | undefined;

  if (!row) return null;
  return {
    state: row.state as ProvisionState,
    endpoint: row.endpoint ?? undefined,
    instanceId: row.instance_id ?? undefined,
  };
}

export function dbUpsertProvisionState(
  state: ProvisionState,
  endpoint?: string,
  instanceId?: string,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO provision_state (key, state, endpoint, instance_id, updated_at)
    VALUES ('instance', ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      state = excluded.state,
      endpoint = excluded.endpoint,
      instance_id = excluded.instance_id,
      updated_at = excluded.updated_at
  `).run(state, endpoint ?? null, instanceId ?? null, Date.now());
}
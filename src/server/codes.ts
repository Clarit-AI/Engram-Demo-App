import {
  dbInitializeCodeRedemption,
  dbGetRedemptionCount,
  dbIncrementRedemption,
} from './db';

export type CodeType = 'public' | 'partner' | 'investor';

export interface InviteCode {
  value: string;
  label: string;
  type: CodeType;
  maxUses?: number;
  currentUses: number;
  expiresAt?: Date;
  active: boolean;
}

interface RedeemResult {
  success: boolean;
  error?: string;
  code?: InviteCode;
}

const codes: Map<string, InviteCode> = new Map();

export function parseInviteCodes(raw: string | undefined): void {
  codes.clear();
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Array<{
      value: string;
      label: string;
      type: CodeType;
      maxUses?: number;
      expiresAt?: string;
    }>;
    for (const entry of parsed) {
      const code: InviteCode = {
        value: entry.value,
        label: entry.label,
        type: entry.type ?? 'public',
        maxUses: entry.maxUses,
        currentUses: 0,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : undefined,
        active: true,
      };
      codes.set(entry.value, code);
      dbInitializeCodeRedemption(entry.value);
    }
  } catch {
    // Invalid JSON, leave cleared
  }
}

export function getInviteCodes(): InviteCode[] {
  return Array.from(codes.values());
}

function syncCurrentUses(value: string): void {
  const code = codes.get(value);
  if (!code) return;
  code.currentUses = dbGetRedemptionCount(value);
}

export function validateCode(value: string): InviteCode | null {
  const code = codes.get(value);
  if (!code) return null;
  syncCurrentUses(value);
  return code;
}

export function redeemCode(value: string): RedeemResult {
  const code = codes.get(value);
  if (!code) {
    return { success: false, error: 'Invalid code.' };
  }
  if (!code.active) {
    return { success: false, error: 'This code is no longer active.' };
  }
  if (code.expiresAt && code.expiresAt <= new Date()) {
    return { success: false, error: 'This code has expired.' };
  }
  if (code.maxUses !== undefined && code.currentUses >= code.maxUses) {
    return { success: false, error: 'This code has reached its maximum uses.' };
  }
  dbIncrementRedemption(value);
  code.currentUses += 1;
  return { success: true, code };
}